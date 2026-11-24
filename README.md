# Acelera V3 — Feirão 4 Lojas (Rio do Sul/SC)

Site de alta conversão + **CRM de leads com agente de WhatsApp 24h** + painéis (admin e uma área por loja) + integração de estoque com Meta Ads.

```
Anúncio Meta ─┐                                   ┌─ Painel ADMIN  (/admin)
Site (/?carro=)├─► WhatsApp ─► Agente (Claude) ───┤  visão geral · conversas · campanhas · agente
Lista VIP ────┘     │              │              └─ Painel LOJA   (/loja/<slug>)
                    │              ├─ busca estoque (4 lojas, sync horário)      leads qualificados + conversas
                    │              ├─ envia fotos + convite do feirão
                    │              ├─ qualifica (score 0–100) e escolhe a loja
                    │              └─ avisa a loja no WhatsApp quando qualifica
                    └─► Meta CAPI: devolve "LeadQualificado" para otimizar os anúncios
```

## Como funciona

| Etapa | O que acontece |
| --- | --- |
| Clique no site | Todo botão de WhatsApp abre `wa.me` com `[Ref: AV3-NA-001] [#sid]`. O `sid` casa o clique (UTM, `fbclid`) com a conversa que chegar. |
| Cadastro (lista VIP) | `POST /api/leads/capture` cria o lead e o agente manda boas-vindas + arte do feirão em segundos. |
| Anúncio click-to-WhatsApp | O webhook traz o `ad_id`/`ctwa_clid`; o lead fica ligado ao anúncio. |
| Conversa | Webhook → agente Claude com ferramentas: `buscar_estoque`, `enviar_fotos`, `enviar_convite_feirao`, `atualizar_lead`, `agendar_visita`, `transferir_para_humano`. |
| Qualificação | Score determinístico em código (`src/lib/agent/qualificacao.ts`): interesse, orçamento, entrada, troca, prazo, visita. Qualifica com score ≥ 60 + sinal real de compra. |
| Aviso à loja | Loja do carro de interesse → loja com mais carros compatíveis → loja com menos leads abertos. Recebe ficha no WhatsApp + link do painel. |
| Follow-up | 2 h, 24 h e 72 h (8h–20h BRT), lembrete de visita no dia anterior. Cliente que diz "parar" sai da lista. |
| Humano assume | Loja responde pelo painel (ou pelo celular da instância): o agente pausa até ser devolvido. |

## Rodando

```bash
npm install
cp .env.example .env.local   # preencha (veja abaixo)
npm run sync                 # estoque das 4 lojas
npm run dev                  # http://localhost:3000
```

Mínimo para subir os painéis: `AUTH_SECRET`, `ADMIN_PASSWORD`, `LOJA_PASSWORD_<MV|NA|RA|V3>`.
Para o agente atender: `ANTHROPIC_API_KEY` + um provedor de WhatsApp (`WHATSAPP_PROVIDER`).
**Admin → Agente & Config** mostra um checklist do que falta e permite **testar o agente sem enviar nada ao WhatsApp**.

### Logins

`/login` — usuário `admin`, ou o slug da loja (`manos-veiculos`, `nenem-autos`, `rosa-automoveis`, `v3-automoveis`). Cada loja só enxerga os próprios leads.

### WhatsApp (escolha um)

- **Evolution API** (`WHATSAPP_PROVIDER=evolution`): aponte o webhook `MESSAGES_UPSERT` para
  `https://SEU-DOMINIO/api/whatsapp/webhook?secret=<WEBHOOK_SECRET>`. Mensagens digitadas por um humano no celular da instância pausam o agente.
- **Meta Cloud API** (`WHATSAPP_PROVIDER=meta`): callback `https://SEU-DOMINIO/api/whatsapp/webhook`, `META_VERIFY_TOKEN` e `META_APP_SECRET` (assinatura validada).
  Atenção: fora da janela de 24 h a Meta exige *template aprovado* — follow-ups tardios e boas-vindas frias falharão sem isso.

### Meta Ads

- **Estoque no catálogo:** `GET /api/feed/meta?key=<FEED_KEY>` (CSV, fotos convertidas para JPEG, `custom_label_0..4` por loja/categoria/faixa de preço/pronta entrega/ano). Cadastre como *feed agendado* a cada hora. Os anúncios abrem `/?carro=<CÓDIGO>`.
- **Painel em tempo real:** `META_ADS_TOKEN` (permissão `ads_read`) + `META_AD_ACCOUNT_ID` → gasto, cliques, CTR, conversas, **CPL e custo por lead qualificado** por campanha e anúncio (cruzando com os leads do CRM).
- **Otimização por qualificado:** `META_PIXEL_ID` + `META_CAPI_TOKEN` enviam o evento `LeadQualificado` (telefone com hash) à Conversions API.
- Use `utm_campaign` = ID ou nome exato da campanha nos links dos anúncios para a atribuição.

### Agendador

Embutido (`src/instrumentation.ts`): follow-ups, lembretes e sync horário do estoque. Em hospedagem sem processo persistente, use `INTERNAL_CRON=off` e chame `POST /api/cron/tick` (header `Authorization: Bearer <CRON_SECRET>`) a cada minuto.

## Dados e deploy

Leads, mensagens e eventos ficam em arquivos (`data/runtime/`, ou `DATA_DIR`) em memória + persistência, a mesma premissa do `data/estoque.json`:
**uma única instância com disco persistente** (VPS/Docker com volume). Não use Vercel/serverless sem migrar o store (`src/lib/db/store.ts` é a única camada de dados; trocá-la por Postgres/Supabase não afeta o resto). Faça backup de `DATA_DIR`.

## API de estoque (chatbot/n8n)

| Método | Endpoint | Uso |
| --- | --- | --- |
| `GET` | `/api/chatbot/resumo` | Resumo + catálogo compacto das 4 lojas |
| `GET` | `/api/chatbot/buscar` | Busca (`q`, `codigo`, `orcamento`, `categoria`, `cambio`, `loja`…) com `mensagemProntaWhatsapp` |
| `GET` | `/api/veiculos` · `/api/veiculos/[codigo]` | Listagem e ficha completa |
| `GET` | `/api/lojas` | Lojas e contagens |
| `POST` | `/api/sync` | Re-extrai os 4 sites (`Authorization: Bearer <SYNC_SECRET>`) |

Detalhes em [CHATBOT_INTEGRATION.md](CHATBOT_INTEGRATION.md).

## Limites conhecidos

- Áudio e imagem do cliente chegam como `[áudio]`/`[imagem]`; o agente pede que escreva (transcrição é um próximo passo).
- Atenção a LGPD: o formulário deve deixar claro o contato por WhatsApp; opt-out ("parar") já é respeitado.
- Evolution API é não oficial: respeite os limites de follow-up para não arriscar banimento do número.
