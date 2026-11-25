-- ════════════════════════════════════════════════════════════════════════════
-- Migration av3_instancias
-- Batimento das instâncias do servidor do Acelera V3. Durante um deploy (ou com mais de um
-- processo) duas instâncias convivem; a mais nova viva (visto_em nos últimos 45 s) é a "líder"
-- e só ela roda follow-ups, lista de espera e sync do estoque. Ver src/lib/db/sync.ts.
-- Só o servidor (service_role) acessa. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.av3_instancias (
  id text primary key check (id ~ '^[a-z0-9-]{4,40}$'),
  iniciada_em timestamptz not null,
  visto_em timestamptz not null default now()
);
create index if not exists av3_instancias_visto_idx on public.av3_instancias (visto_em desc);

alter table public.av3_instancias enable row level security;
drop policy if exists av3_instancias_sem_acesso_publico on public.av3_instancias;
create policy av3_instancias_sem_acesso_publico on public.av3_instancias
  as restrictive for all to anon, authenticated using (false) with check (false);
revoke all on public.av3_instancias from anon, authenticated;

-- limpeza: instâncias mortas há mais de 1 dia (roda junto com a limpeza diária, se houver pg_cron)
-- select cron.schedule('av3_limpeza_instancias', '15 7 * * *', $$delete from public.av3_instancias where visto_em < now() - interval '1 day'$$);
