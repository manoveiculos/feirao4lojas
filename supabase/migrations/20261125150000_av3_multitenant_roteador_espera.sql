-- ════════════════════════════════════════════════════════════════════════════
-- Migration av3_multitenant_roteador_espera
-- Acelera V3: perfis super_admin/store_user (RLS), lojas com WhatsApp de notificação,
-- campos do Agente Roteador em av3_leads e a tabela av3_lista_espera.
--
-- Projeto Supabase compartilhado ("Manos Veiculos"): só toca objetos com prefixo av3_.
-- O servidor Next.js continua usando service_role (ignora RLS). As políticas abaixo valem
-- para qualquer acesso com JWT de usuário (role authenticated) e garantem o isolamento por loja
-- também no banco, além do filtro já feito no servidor (src/lib/painel.ts).
-- Idempotente: pode rodar mais de uma vez.
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────── 1) Lojas ─────────────────────────
create table if not exists public.av3_lojas (
  slug text primary key check (slug in ('nenem-autos','rosa-automoveis','v3-automoveis','manos-veiculos')),
  nome text not null,
  sigla text not null unique check (sigla in ('MV','NA','RA','V3')),
  -- número (55DDDNÚMERO) ou JID de grupo do WhatsApp (ex.: 120363000000000000@g.us) que recebe os leads filtrados
  whatsapp_notificacao text check (
    whatsapp_notificacao is null
    or whatsapp_notificacao ~ '^[0-9]{10,15}$'
    or whatsapp_notificacao ~ '^[0-9-]{10,40}@g\.us$'
  ),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

insert into public.av3_lojas (slug, nome, sigla) values
  ('manos-veiculos', 'Manos Veículos', 'MV'),
  ('nenem-autos', 'Neném Autos', 'NA'),
  ('rosa-automoveis', 'Rosa Automóveis', 'RA'),
  ('v3-automoveis', 'V3 Automóveis', 'V3')
on conflict (slug) do nothing;

-- Copia os telefones de aviso já configurados no painel (av3_settings.dados.lojaTelefones)
update public.av3_lojas l
set whatsapp_notificacao = s.dados->'lojaTelefones'->>l.slug, atualizado_em = now()
from public.av3_settings s
where s.id = 1
  and l.whatsapp_notificacao is null
  and coalesce(s.dados->'lojaTelefones'->>l.slug, '') ~ '^[0-9]{10,15}$';

-- ───────────────────────── 2) Roteamento em av3_leads ─────────────────────────
comment on column public.av3_leads.loja_slug is
  'loja_responsavel: preenchida SOMENTE pelo Agente Roteador após a triagem do SDR. NULL = lead em triagem (nenhuma loja vê nem é avisada).';

alter table public.av3_leads
  add column if not exists loja_sugerida text,
  add column if not exists roteado_em timestamptz,
  add column if not exists roteamento_motivo text,
  add column if not exists notificado_loja_em timestamptz;

do $$ begin
  alter table public.av3_leads add constraint av3_leads_loja_sugerida_ck
    check (loja_sugerida is null or loja_sugerida in ('nenem-autos','rosa-automoveis','v3-automoveis','manos-veiculos'));
exception when duplicate_object then null; end $$;

-- O app grava o lead inteiro em "dados"; o gatilho mantém as colunas de roteamento em sincronia
-- (assim o código funciona antes e depois desta migração, sem mudar o upsert).
create or replace function public.av3_leads_sincronizar_roteamento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.loja_sugerida := nullif(new.dados->>'lojaSugerida', '');
  new.roteado_em := nullif(new.dados->>'roteadoEm', '')::timestamptz;
  new.roteamento_motivo := nullif(new.dados->>'roteamentoMotivo', '');
  new.notificado_loja_em := nullif(new.dados->>'lojaNotificadaEm', '')::timestamptz;
  return new;
end $$;

-- o projeto concede EXECUTE em funções novas para anon/authenticated por padrão; função de gatilho não precisa
revoke all on function public.av3_leads_sincronizar_roteamento() from public, anon, authenticated;

drop trigger if exists av3_leads_sincronizar_roteamento on public.av3_leads;
create trigger av3_leads_sincronizar_roteamento
  before insert or update on public.av3_leads
  for each row execute function public.av3_leads_sincronizar_roteamento();

-- Backfill (mesma regra de src/lib/db/store.ts → normalizarLeadLegado):
-- a) lead já qualificado/notificado = considerado roteado
update public.av3_leads
set dados = dados || jsonb_build_object(
      'roteadoEm', coalesce(dados->>'qualificadoEm', dados->>'lojaNotificadaEm'),
      'roteamentoMotivo', 'legado')
where loja_slug is not null
  and not (dados ? 'roteadoEm')
  and (qualificado_em is not null or nullif(dados->>'lojaNotificadaEm', '') is not null);

-- b) lead ainda em triagem: a loja vira só sugestão e sai do painel da loja
update public.av3_leads
set loja_slug = null,
    dados = dados || jsonb_build_object('lojaSugerida', loja_slug, 'lojaSlug', null, 'roteadoEm', null, 'roteamentoMotivo', '')
where loja_slug is not null
  and not (dados ? 'roteadoEm')
  and qualificado_em is null
  and nullif(dados->>'lojaNotificadaEm', '') is null;

-- c) demais: dispara o gatilho para preencher as colunas novas em todas as linhas
update public.av3_leads set dados = dados where roteado_em is null and loja_sugerida is null and notificado_loja_em is null;

create index if not exists av3_leads_roteado_idx on public.av3_leads (loja_slug, roteado_em desc) where roteado_em is not null;

-- ───────────────────────── 3) Lista de espera ─────────────────────────
create table if not exists public.av3_lista_espera (
  id uuid primary key,
  lead_id uuid not null references public.av3_leads(id) on delete cascade,
  telefone text not null check (telefone ~ '^[0-9]{10,15}$'),
  nome text not null default '',
  marca text,
  modelo text,
  categoria text,
  ano_minimo integer check (ano_minimo is null or ano_minimo between 1950 and 2100),
  preco_maximo numeric(12,2) check (preco_maximo is null or preco_maximo > 0),
  cambio text check (cambio is null or cambio in ('automatico','manual')),
  tem_troca boolean,
  observacoes text not null default '',
  status text not null default 'aguardando' check (status in ('aguardando','notificado','em_atendimento','encerrado')),
  matched_vehicle_id text,
  matched_codigo text,
  -- ids de veículos já avisados para este registro (anti-spam)
  veiculos_avisados jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  atualizado_em timestamptz not null default now(),
  constraint av3_lista_espera_desejo_ck check (modelo is not null or categoria is not null)
);
create index if not exists av3_lista_espera_status_idx on public.av3_lista_espera (status, created_at desc);
create index if not exists av3_lista_espera_lead_idx on public.av3_lista_espera (lead_id);
create index if not exists av3_lista_espera_modelo_idx on public.av3_lista_espera (lower(modelo)) where status = 'aguardando';

-- ───────────────────────── 4) Usuários dos painéis ─────────────────────────
-- Vincula um usuário do Supabase Auth a um perfil. Hoje o painel usa login próprio (AUTH_SECRET);
-- esta tabela habilita acesso direto ao banco com JWT de usuário, sempre com isolamento por loja.
create table if not exists public.av3_usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  papel text not null check (papel in ('super_admin','store_user')),
  loja_slug text references public.av3_lojas(slug),
  criado_em timestamptz not null default now(),
  constraint av3_usuarios_loja_ck check (
    (papel = 'super_admin' and loja_slug is null) or (papel = 'store_user' and loja_slug is not null)
  )
);

create or replace function public.av3_papel()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select papel from public.av3_usuarios where id = (select auth.uid()) $$;

create or replace function public.av3_loja_do_usuario()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select loja_slug from public.av3_usuarios where id = (select auth.uid()) $$;

revoke all on function public.av3_papel(), public.av3_loja_do_usuario() from public, anon;
grant execute on function public.av3_papel(), public.av3_loja_do_usuario() to authenticated;

-- ───────────────────────── 5) RLS ─────────────────────────
alter table public.av3_lojas enable row level security;
alter table public.av3_lista_espera enable row level security;
alter table public.av3_usuarios enable row level security;

-- anon continua sem acesso a nada (bloqueio restritivo explícito)
drop policy if exists av3_leads_sem_acesso_publico on public.av3_leads;
drop policy if exists av3_mensagens_sem_acesso_publico on public.av3_mensagens;
create policy av3_leads_sem_acesso_publico on public.av3_leads as restrictive for all to anon using (false) with check (false);
create policy av3_mensagens_sem_acesso_publico on public.av3_mensagens as restrictive for all to anon using (false) with check (false);
drop policy if exists av3_lojas_sem_acesso_anon on public.av3_lojas;
drop policy if exists av3_lista_espera_sem_acesso_anon on public.av3_lista_espera;
drop policy if exists av3_usuarios_sem_acesso_anon on public.av3_usuarios;
create policy av3_lojas_sem_acesso_anon on public.av3_lojas as restrictive for all to anon using (false) with check (false);
create policy av3_lista_espera_sem_acesso_anon on public.av3_lista_espera as restrictive for all to anon using (false) with check (false);
create policy av3_usuarios_sem_acesso_anon on public.av3_usuarios as restrictive for all to anon using (false) with check (false);

-- authenticated: somente leitura; toda escrita passa pelo servidor (service_role)
drop policy if exists av3_leads_leitura on public.av3_leads;
create policy av3_leads_leitura on public.av3_leads for select to authenticated using (
  (select public.av3_papel()) = 'super_admin'
  or (
    (select public.av3_papel()) = 'store_user'
    and loja_slug = (select public.av3_loja_do_usuario())
    and (qualificado_em is not null or roteado_em is not null)
  )
);

drop policy if exists av3_mensagens_leitura on public.av3_mensagens;
create policy av3_mensagens_leitura on public.av3_mensagens for select to authenticated using (
  exists (select 1 from public.av3_leads l where l.id = av3_mensagens.lead_id) -- herda a política de av3_leads
);

drop policy if exists av3_lista_espera_leitura on public.av3_lista_espera;
create policy av3_lista_espera_leitura on public.av3_lista_espera for select to authenticated using (
  (select public.av3_papel()) = 'super_admin'
);

drop policy if exists av3_lojas_leitura on public.av3_lojas;
create policy av3_lojas_leitura on public.av3_lojas for select to authenticated using (
  (select public.av3_papel()) = 'super_admin' or slug = (select public.av3_loja_do_usuario())
);

drop policy if exists av3_usuarios_leitura on public.av3_usuarios;
create policy av3_usuarios_leitura on public.av3_usuarios for select to authenticated using (
  id = (select auth.uid()) or (select public.av3_papel()) = 'super_admin'
);

revoke all on public.av3_lojas, public.av3_lista_espera, public.av3_usuarios from anon, authenticated;
grant select on public.av3_leads, public.av3_mensagens, public.av3_lista_espera, public.av3_lojas, public.av3_usuarios to authenticated;
-- av3_eventos, av3_cliques, av3_settings e as views seguem fechadas para anon/authenticated.
