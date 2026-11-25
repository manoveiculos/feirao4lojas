---
name: agente-roteador
description: Agente 2 (Agente Roteador) do Acelera V3 — decide qual das 4 lojas assume o lead já aprovado pelo SDR (veículo específico → loja dona; genérico → rodízio balanceado entre lojas com estoque compatível), grava a loja responsável e avisa o WhatsApp de notificação da loja uma única vez. Use ao mexer em roteamento, distribuição de leads, aviso às lojas, visibilidade multi-tenant do painel ou na lista de espera que roteia direto para a loja do carro.
---

# Agente 2 — Agente Roteador

Serviço interno **determinístico** (sem LLM: regra auditável). Só roda depois que o Agente 1 aprova o lead
(`aprovar_para_roteamento`), e também quando: o cliente pede visita/atendente, a rede de segurança de score dispara,
o cliente aceita um carro da lista de espera, ou o admin atribui a loja manualmente.

Código: `src/lib/agent/roteador.ts` → `decidirLoja()`, `rotearLead()`, `notificarLoja()`, `textoAvisoLoja()`.

## Lógica de decisão (`decidirLoja`)

1. **Veículo específico** — o código mais recente em `perfil.veiculosInteresse` (ou o `codigo_veiculo` passado pelo SDR / o carro avisado pela lista de espera) define a loja pela sigla (`MV`, `NA`, `RA`, `V3`). Motivo `veiculo` ou `lista_espera`.
2. **Loja escolhida pelo cliente** — sem carro específico, mas o cliente veio pelo botão/formulário de uma loja (`lojaSugerida`). Motivo `loja_escolhida`.
3. **Interesse genérico** — `lojasCompativeis()` filtra as lojas com pelo menos um carro compatível (categoria, marca/modelo, orçamento × 1,1); sem nenhuma compatível, entram as 4. Entre as candidatas, **rodízio balanceado**: menor nº de leads roteados nos últimos 7 dias (`cargaDasLojas()`), empate → quem recebeu há mais tempo. Motivo `rodizio`.

## Efeitos (`rotearLead`)

- Grava `lojaSlug` (coluna `loja_slug` = *loja_responsavel*), `roteadoEm`, `roteamentoMotivo`, `qualificadoEm` (se vazio) e status `qualificado`/`visita_agendada`.
- A partir daí o lead aparece no painel da loja (`liberadoParaLoja()` em `src/lib/stats.ts`; no banco, política RLS `av3_leads_leitura`).
- Eventos `roteado` e `qualificado` (+ Conversions API da Meta).
- **Idempotente**: lead já roteado não troca de loja sozinho (só o admin troca, via `lojaForcada`).

## Aviso no WhatsApp da loja (`notificarLoja`)

- Destino: `settings.lojaTelefones[loja]` (= `av3_lojas.whatsapp_notificacao`, configurado em **Agente & Config**) — número `55DDDNÚMERO` ou JID de grupo `…@g.us` (grupo só com Evolution) — e o gerente geral, se configurado.
- Conteúdo: nome e `wa.me/` do cliente; carro/perfil; orçamento, entrada, parcela, troca, pagamento; visita; resumo de até 2 linhas (`resumoDuasLinhas()`: o resumo do SDR ou as 2 últimas falas do cliente); link `https://vyro.drivvoo.com/admin/conversas?lead={id}`.
- O link funciona para a loja: `src/middleware.ts` + `src/app/admin/layout.tsx` levam o usuário de loja para `/loja/{slug}/conversas?lead={id}`, e o login devolve ao link (`?next=`).
- **Nunca duplica**: a flag `lojaNotificadaEm` (coluna `notificado_loja_em`) é marcada antes do envio; só é liberada de novo se o envio falhar para todos os destinos. Troca manual de loja zera a flag para avisar a loja nova.
- Lead de teste (simulador) nunca gera aviso.

## Multi-tenant

| Perfil | Login hoje | No banco (RLS) | Vê |
|---|---|---|---|
| `super_admin` (Admin Geral) | usuário `admin` | `av3_usuarios.papel='super_admin'` | tudo: Visão geral, Leads, Conversas, Lista de Espera, Campanhas, Agente & Config |
| `store_user` | usuário = slug da loja | `av3_usuarios.papel='store_user'` + `loja_slug` | só leads com `loja_slug` = sua loja **e** já roteados/qualificados; sem Campanhas, Agente & Config, Lista de Espera |

Proteções: layouts (`/admin` só admin), APIs (`exigirApi(req, 'admin')` e `leadAcessivel()`), e RLS na migração `supabase/migrations/20261125150000_av3_multitenant_roteador_espera.sql`.

## Como testar

```bash
npx tsx scripts/test-roteamento.ts
```

Roda tudo em memória, com `WHATSAPP_PROVIDER=none` e banco desligado, e verifica: triagem sem loja, aprovação negada para curioso, veículo → loja dona, rodízio, aviso único, lista de espera → match → roteamento.

## Checklist ao mudar o roteador

- [ ] A decisão continua pura (`decidirLoja` não grava nada) e testada.
- [ ] Nenhum outro módulo grava `lojaSlug` direto.
- [ ] A regra de visibilidade em `liberadoParaLoja()` e a política RLS continuam iguais.
- [ ] O aviso continua idempotente (`lojaNotificadaEm`).
