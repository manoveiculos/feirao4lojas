---
name: sdr-principal
description: Agente 1 (SDR Principal) do atendimento WhatsApp do Acelera V3 — triagem de 100% dos leads novos, tools atualizar_ficha_lead / consultar_estoque / cadastrar_lista_espera / aprovar_para_roteamento e a regra de ouro "nenhuma loja vê ou é avisada antes da aprovação". Use ao alterar o prompt, as tools, a qualificação, o debounce ou a lista de espera do agente, ou para testar o agente sem enviar WhatsApp real.
---

# Agente 1 — SDR Principal

Atende **todo** contato novo no número único do Acelera V3, qualifica de forma natural e **filtra curiosos e quem para de responder** antes de qualquer loja ver o lead.

## Onde está no código

| O quê | Arquivo |
|---|---|
| Prompt (identidade, regras, triagem, lista de espera) | `src/lib/agent/prompt.ts` → `promptBase()` / `promptLead()` |
| Tools e loop com o Claude | `src/lib/agent/engine.ts` → `TOOLS`, `executarTool()`, `responderLead()` |
| Score e critério mínimo de aprovação | `src/lib/agent/qualificacao.ts` → `calcularScore()`, `criteriosMinimos()`, `reavaliarLead()` |
| Debounce de 5 s (mensagens quebradas) | `src/lib/agent/inbound.ts` (`AGENT_DEBOUNCE_MS`, padrão 5000) |
| Lista de espera e motor de match | `src/lib/espera/espera.ts` |
| Simulador do admin (não envia WhatsApp) | `/admin/agente` → `src/app/api/admin/agente/teste/route.ts` |

## Fatos do negócio (vêm do código — nunca invente)

- Evento: `FEIRAO_CONFIG` em `src/lib/config.ts` — **ACELERA V3**, Rio do Sul/SC, "De 14 a 23 de dezembro de 2026", local único: V3 Automóveis — Centro, Alameda Aristiliano Ramos, 741.
- Lojas: `LOJAS` em `src/lib/config.ts` — Manos Veículos (MV), Neném Autos (NA), Rosa Automóveis (RA), V3 Automóveis (V3). Código do carro = sigla da loja + número (ex.: `NA-001`).
- Benefícios permitidos: `CAMPAIGN_COPY.faixaConfianca` e `CAMPAIGN_COPY.legal` em `src/lib/campaign.ts` (pronta entrega, 1ª parcela depois do Carnaval, avaliação do usado na hora; C6 Bank e Viacredi Alto Vale sujeitos a crédito).
- Horário do feirão: `NEXT_PUBLIC_HORARIO_FEIRAO`; se vazio, o agente **não** informa horário.
- Estoque: `data/estoque.json` (sincronizado das 4 lojas). Preço, ano, km e disponibilidade só via `consultar_estoque`.

## Regra de ouro

Enquanto o lead está em triagem, `lojaSlug` (coluna `loja_slug` = *loja_responsavel*) fica **NULL**:
nenhuma loja vê o lead no painel (`liberadoParaLoja()` em `src/lib/stats.ts` + RLS `av3_leads_leitura`) e **nenhum aviso** sai.
Pistas de origem (botão de uma loja no site, ref `AV3-NA-001`, formulário de loja) vão para `lojaSugerida` — só o roteador as usa.

## Tools obrigatórias

1. **`atualizar_ficha_lead`** — preenche a ficha lateral (interesse, orçamento, entrada, parcela, pagamento, troca, prazo; visita vem de `agendar_visita`) e recalcula `score`/`temperatura`. Só o que o cliente disse.
2. **`consultar_estoque`** — busca no estoque consolidado (`filterVeiculos`). Nunca inventar veículo, preço ou condição.
3. **`cadastrar_lista_espera`** — quando a consulta volta vazia para o desejo do cliente (depois de oferecer até 2 alternativas reais). Grava em `av3_lista_espera` (status `aguardando`) e o agente avisa que o cliente entrou na lista prioritária. Repetir a chamada atualiza o pedido ativo do mesmo lead (não duplica).
4. **`aprovar_para_roteamento`** — dispara o Agente 2 (`.claude/skills/agente-roteador`). O código revalida `criteriosMinimos()`:
   - o cliente **respondeu** (`totalMensagensLead >= 1`), **e**
   - interesse claro **+** condição (orçamento/entrada/parcela/forma de pagamento **ou** troca definida), **ou**
   - pedido explícito de visita/simulação/negociação/vendedor (`pedido_explicito: true`), **ou**
   - resposta a um aviso da lista de espera (`lead.esperaAviso`).
   Se faltar algo, a tool devolve `faltando` e o agente faz UMA pergunta curta.

Tools auxiliares mantidas: `enviar_fotos`, `enviar_convite_feirao`, `agendar_visita` (pedido de visita = aprovação explícita → roteia), `transferir_para_humano` (pausa o agente e roteia/avisa a loja).

Rede de segurança: se o lead atingir a qualificação forte (score ≥ `scoreQualificado` + prazo ≤ 30 dias ou visita) e já respondeu, `reavaliarLead()` aciona o roteador mesmo sem a tool.

## Estilo no WhatsApp

Mensagens curtas (≤ 3 linhas por parágrafo, ≤ 2 parágrafos), **uma pergunta por vez**, no máximo 1–2 emojis, sempre empurrando o próximo passo. Áudio aparece como `[áudio]`: pedir para escrever. Opt-out ("parar") é tratado no `inbound.ts` antes do agente.

## Como testar sem disparar WhatsApp real

O `.env.local` tem credenciais reais (Evolution com o número oficial, Supabase, Anthropic). **Sempre** sobrescreva no processo:

```bash
WHATSAPP_PROVIDER=none SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= DATA_DIR=<pasta temporária> npm run dev
```

- Teste de conversa: `/admin/agente` → "Testar o agente" (lead `teste`, nada vai ao WhatsApp nem ao banco; precisa de `ANTHROPIC_API_KEY`).
- Teste das regras sem LLM: chame `executarTool()` direto (ver `scripts/test-roteamento.ts`).
- Nunca use telefone que possa ser real em teste com provedor ligado.

## Checklist ao mudar o agente

- [ ] Prompt e descrição das tools dizem a mesma coisa que `criteriosMinimos()`.
- [ ] Nenhum caminho novo grava `lojaSlug` direto — só `rotearLead()` (ou o admin pelo PATCH, que também passa pelo roteador).
- [ ] Toda informação factual nova vem de `config.ts`/`campaign.ts`/estoque, não do prompt.
- [ ] `npx tsc --noEmit` e `npx tsx scripts/test-roteamento.ts` passam.
