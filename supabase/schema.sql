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
