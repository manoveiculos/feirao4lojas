-- Acelera V3: telemetria de acessos do site (visitante, origem, jornada, tempo por carro).
-- Já aplicada no projeto Manos Veiculos (migration av3_acessos_telemetria_do_site).
-- Prefixo av3_; RLS ligado, só o servidor (service_role) acessa. Nunca guardamos o IP.

create table if not exists public.av3_acessos (
  id text primary key,                                   -- event_id estável: o tempo ativo atualiza a mesma linha
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  visitor_id text not null,                              -- cookie av3_vid (também é o sid do clique de WhatsApp)
  session_id text,
  canal text not null default 'direto',                  -- meta_ads | google_ads | tiktok_ads | organico | direto
  sub_origem text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  gclid text, fbclid text, ttclid text,
  referrer text,
  campanha_id text, conjunto_id text, anuncio_id text,
  acao text not null,                                    -- page_view | view_vehicle | filter_stock | simulacao | troca | whatsapp_click | popup_saida | lead_formulario
  pagina text,
  veiculo_id text, veiculo_nome text, valor_veiculo numeric,
  detalhe text,
  dispositivo text, dispositivo_detalhe text, navegador text,
  cidade text, uf text, pais text,
  tempo_segundos integer not null default 0,             -- tempo ATIVO (aba visível + interação)
  fotos_vistas integer not null default 0,
  abriu_galeria boolean not null default false,
  scroll_max integer not null default 0,
  interacoes jsonb not null default '{}'::jsonb,
  constraint av3_acessos_canal_ck check (canal in ('meta_ads','google_ads','tiktok_ads','organico','direto')),
  constraint av3_acessos_scroll_ck check (scroll_max between 0 and 100),
  constraint av3_acessos_tempo_ck check (tempo_segundos between 0 and 14400)
);
create index if not exists av3_acessos_criado_idx on public.av3_acessos (criado_em desc);
create index if not exists av3_acessos_visitor_idx on public.av3_acessos (visitor_id, criado_em);
create index if not exists av3_acessos_veiculo_idx on public.av3_acessos (veiculo_id) where veiculo_id is not null;
create index if not exists av3_acessos_campanha_idx on public.av3_acessos (utm_campaign) where utm_campaign is not null;

alter table public.av3_acessos enable row level security;
revoke all on public.av3_acessos from anon, authenticated;
create policy av3_acessos_sem_acesso_publico on public.av3_acessos as restrictive for all to anon, authenticated using (false) with check (false);

-- av3_acessos_upsert(linhas jsonb): upsert em lote em que o MAIOR tempo/fotos/scroll vence
-- (pings repetidos ou fora de ordem nunca diminuem o que já foi medido). Definição completa
-- aplicada no projeto: select pg_get_functiondef('public.av3_acessos_upsert(jsonb)'::regprocedure);
-- Retenção: pg_cron "av3_limpeza_acessos" apaga eventos com mais de 120 dias, todo dia às 04h30 BRT.
