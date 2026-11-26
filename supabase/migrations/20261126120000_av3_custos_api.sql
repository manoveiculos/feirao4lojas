-- Consumo exato (tokens) de cada chamada às APIs pagas por uso: Claude (Anthropic) e OpenAI (áudio).
-- O custo em R$ é calculado na hora de mostrar (aba Custos), com a tabela de preços editável.
-- Só o servidor (service_role) acessa. Idempotente.
create table if not exists public.av3_custos_api (
  id uuid primary key,
  ts timestamptz not null default now(),
  servico text not null check (servico in ('anthropic','openai')),
  modelo text not null,
  entrada integer not null default 0,
  saida integer not null default 0,
  cache_escrita integer not null default 0,
  cache_leitura integer not null default 0,
  lead_id uuid
);
create index if not exists av3_custos_api_ts_idx on public.av3_custos_api (ts desc);

alter table public.av3_custos_api enable row level security;
drop policy if exists av3_custos_api_sem_acesso_publico on public.av3_custos_api;
create policy av3_custos_api_sem_acesso_publico on public.av3_custos_api
  as restrictive for all to anon, authenticated using (false) with check (false);
revoke all on public.av3_custos_api from anon, authenticated;
