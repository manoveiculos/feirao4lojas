-- Acelera V3 (feirão 4 lojas): leads, conversas, eventos e atribuição.
-- Já aplicado no projeto Supabase "Manos Veiculos" (migration av3_acelera_v3_leads_conversas).
-- Prefixo av3_ isola do restante do banco. RLS ligado sem políticas: só o servidor (service_role) acessa.

create table if not exists public.av3_leads (
  id uuid primary key,
  telefone text not null unique,
  nome text not null default '',
  status text not null default 'novo',
  score integer not null default 0,
  temperatura text not null default 'frio',
  loja_slug text,
  qualificado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  dados jsonb not null default '{}'::jsonb  -- lead completo (origem, perfil, visita, controle de follow-up...)
);
create index if not exists av3_leads_loja_idx on public.av3_leads (loja_slug, status);
create index if not exists av3_leads_qualificado_idx on public.av3_leads (qualificado_em) where qualificado_em is not null;
create index if not exists av3_leads_criado_idx on public.av3_leads (criado_em desc);

create table if not exists public.av3_mensagens (
  id uuid primary key,
  lead_id uuid not null references public.av3_leads(id) on delete cascade,
  autor text not null check (autor in ('lead','agente','humano','sistema')),
  texto text not null default '',
  midias jsonb not null default '[]'::jsonb,
  wa_id text,
  ts timestamptz not null default now()
);
create index if not exists av3_mensagens_lead_idx on public.av3_mensagens (lead_id, ts);
create unique index if not exists av3_mensagens_wa_id_uq on public.av3_mensagens (wa_id) where wa_id is not null and wa_id <> '';

create table if not exists public.av3_eventos (
  id uuid primary key,
  tipo text not null,
  lead_id uuid references public.av3_leads(id) on delete cascade,
  loja_slug text,
  meta jsonb not null default '{}'::jsonb,
  ts timestamptz not null default now()
);
create index if not exists av3_eventos_tipo_ts_idx on public.av3_eventos (tipo, ts desc);
create index if not exists av3_eventos_lead_idx on public.av3_eventos (lead_id);

create table if not exists public.av3_cliques (
  sid text primary key,
  dados jsonb not null default '{}'::jsonb,
  usado boolean not null default false,
  ts timestamptz not null default now()
);

create table if not exists public.av3_settings (
  id integer primary key default 1 check (id = 1),
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

alter table public.av3_leads enable row level security;
alter table public.av3_mensagens enable row level security;
alter table public.av3_eventos enable row level security;
alter table public.av3_cliques enable row level security;
alter table public.av3_settings enable row level security;

revoke all on public.av3_leads, public.av3_mensagens, public.av3_eventos, public.av3_cliques, public.av3_settings from anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Migration av3_otimizacao_validacoes_views_retencao (aplicada em 25/11/2026)
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Validações
alter table public.av3_leads
  add constraint av3_leads_status_ck check (status in ('novo','em_atendimento','qualificado','visita_agendada','visitou','comprou','perdido','optout')),
  add constraint av3_leads_temperatura_ck check (temperatura in ('frio','morno','quente')),
  add constraint av3_leads_score_ck check (score between 0 and 100),
  add constraint av3_leads_telefone_ck check (telefone ~ '^[0-9]{10,15}$'),
  add constraint av3_leads_loja_ck check (loja_slug is null or loja_slug in ('nenem-autos','rosa-automoveis','v3-automoveis','manos-veiculos'));
alter table public.av3_eventos
  add constraint av3_eventos_loja_ck check (loja_slug is null or loja_slug in ('nenem-autos','rosa-automoveis','v3-automoveis','manos-veiculos'));

-- 2) Bloqueio explícito para anon/authenticated (service_role ignora RLS)
create policy av3_leads_sem_acesso_publico on public.av3_leads as restrictive for all to anon, authenticated using (false) with check (false);
create policy av3_mensagens_sem_acesso_publico on public.av3_mensagens as restrictive for all to anon, authenticated using (false) with check (false);
create policy av3_eventos_sem_acesso_publico on public.av3_eventos as restrictive for all to anon, authenticated using (false) with check (false);
create policy av3_cliques_sem_acesso_publico on public.av3_cliques as restrictive for all to anon, authenticated using (false) with check (false);
create policy av3_settings_sem_acesso_publico on public.av3_settings as restrictive for all to anon, authenticated using (false) with check (false);

-- 3) Índices
create index if not exists av3_eventos_ts_idx on public.av3_eventos (ts desc);
create index if not exists av3_leads_campanha_idx on public.av3_leads ((dados->'origem'->>'utm_campaign')) where dados->'origem'->>'utm_campaign' <> '';
create index if not exists av3_leads_atualizado_idx on public.av3_leads (atualizado_em desc);

-- 4) Views de relatório (security_invoker, sem acesso para anon/authenticated)
create or replace view public.av3_vw_leads with (security_invoker = true) as
select
  l.id, l.nome, l.telefone, l.loja_slug, l.status, l.temperatura, l.score,
  (l.qualificado_em is not null) as qualificado, l.qualificado_em, l.criado_em, l.atualizado_em,
  (l.dados->>'ultimaMensagemEm')::timestamptz as ultima_mensagem_em,
  coalesce((l.dados->>'totalMensagensLead')::int, 0) as mensagens_do_lead,
  coalesce((l.dados->>'humano')::boolean, false) as atendimento_humano,
  l.dados->'origem'->>'canal' as canal,
  l.dados->'origem'->>'utm_source' as utm_source,
  l.dados->'origem'->>'utm_medium' as utm_medium,
  l.dados->'origem'->>'utm_campaign' as utm_campaign,
  l.dados->'origem'->>'ad_id' as ad_id,
  l.dados->'origem'->>'ref' as ref_site,
  l.dados->'perfil'->'veiculosInteresse' as veiculos_interesse,
  l.dados->'perfil'->>'categoria' as categoria,
  l.dados->'perfil'->>'marca_modelo' as marca_modelo,
  (l.dados->'perfil'->>'orcamento')::numeric as orcamento,
  (l.dados->'perfil'->>'entrada')::numeric as entrada,
  l.dados->'perfil'->>'formaPagamento' as forma_pagamento,
  (l.dados->'perfil'->>'temTroca')::boolean as tem_troca,
  concat_ws(' ', l.dados->'perfil'->>'trocaModelo', l.dados->'perfil'->>'trocaAno') as troca,
  l.dados->'perfil'->>'prazoCompra' as prazo_compra,
  l.dados->'visita'->>'quando' as visita,
  l.dados->>'resumo' as resumo
from public.av3_leads l;

create or replace view public.av3_vw_funil_diario with (security_invoker = true) as
select
  (l.criado_em at time zone 'America/Sao_Paulo')::date as dia,
  coalesce(l.loja_slug, 'sem-loja') as loja_slug,
  count(*) as leads,
  count(*) filter (where coalesce((l.dados->>'totalMensagensLead')::int, 0) > 0) as conversaram,
  count(*) filter (where l.qualificado_em is not null) as qualificados,
  count(*) filter (where l.dados->'visita'->>'quando' is not null) as visitas_agendadas,
  count(*) filter (where l.status in ('visitou','comprou')) as visitaram,
  count(*) filter (where l.status = 'comprou') as compraram
from public.av3_leads l
group by 1, 2;

revoke all on public.av3_vw_leads, public.av3_vw_funil_diario from anon, authenticated;

-- 5) Retenção: pg_cron "av3_limpeza_cliques" apaga cliques com mais de 30 dias, todo dia às 04h BRT
-- select cron.schedule('av3_limpeza_cliques', '0 7 * * *', $$delete from public.av3_cliques where ts < now() - interval '30 days'$$);
