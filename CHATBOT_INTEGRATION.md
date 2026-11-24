# Guia de Integração do Chatbot de WhatsApp — Feirão 4 Lojas

> **Atualização:** o agente de WhatsApp agora roda dentro do próprio projeto (`/api/whatsapp/webhook`, veja o [README](README.md)).
> Este guia continua válido para quem quiser consumir a API de estoque por fora (n8n, Typebot etc.).
> As mensagens do site terminam com `[Ref: AV3-...]` e um `[#sid]` de atribuição (ex.: `[#k3j9x2ab]`), que o backend remove e usa para ligar o clique à conversa.

A API do Feirão foi desenhada especificamente para alimentar chatbots de WhatsApp (n8n, Typebot, Manychat, Evolution API, Z-API, Botpress ou Agentes de IA com OpenAI/Gemini).

Todos os endpoints respondem em **JSON UTF-8** com **CORS liberado (`*`)**.

---

## 1. Fluxo Recomendado no Chatbot

### Cenário A: Cliente clicou em um carro específico na página do Feirão
Todos os botões de WhatsApp da página enviam automaticamente o **código único do carro** na mensagem inicial, por exemplo:
> `Olá! Vi o *Renault Boreal Iconic 1.3 Turbo Automático (2026 | R$ 179.900) [Cód: NA-001]* na página do Feirão 4 Lojas (loja Neném Autos) e quero mais informações!`

1. Extraia o código da mensagem usando a regex: `([A-Z0-9]{2}-\d{3})` (ex: `NA-001`, `V3-001`, `MV-001`, `RA-001`).
2. Faça um `GET`:
   ```http
   GET https://SEU-DOMINIO.com.br/api/veiculos/NA-001
   ```
3. A resposta já traz:
   - `veiculo`: título, marca, modelo, ano, preço, km, câmbio, combustível, cor, portas, descrição, todos os `opcionais` e todas as URLs de `fotos`
   - `loja`: nome, endereço e cidade
   - `textoWhatsapp`: ficha resumida pronta para responder ao cliente no WhatsApp!

### Cenário B: Cliente pergunta "quais carros vocês têm?" ou "tem SUV até 120 mil?"
1. Para **visão geral de todo o estoque**:
   ```http
   GET https://SEU-DOMINIO.com.br/api/chatbot/resumo
   ```
   Retorna `totalVeiculos`, `lojas`, `marcas`, `categorias`, `faixaPreco`, `resumoTexto` e `catalogoCompacto` (lista leve com todos os carros das 4 lojas).

2. Para **busca filtrada pronta para WhatsApp**:
   ```http
   GET https://SEU-DOMINIO.com.br/api/chatbot/buscar?categoria=suv&orcamento=120000&limit=5
   ```
   Parâmetros aceitos (todos opcionais e combináveis):
   - `q` — texto livre (ex: `corolla`, `automatico branco`, `strada`, `byd`)
   - `codigo` — código curto (ex: `V3-001`)
   - `orcamento` ou `precoMax` — valor máximo em reais (ex: `90000`)
   - `precoMin` — valor mínimo em reais
   - `marca` — ex: `volkswagen`, `toyota`, `fiat`, `honda`, `byd`, `gwm`
   - `modelo` — ex: `nivus`, `t-cross`, `strada`, `hb20`
   - `categoria` — `suv`, `sedan`, `hatch`, `picape`, `moto`, `utilitario`
   - `cambio` — `automatico` ou `manual`
   - `combustivel` — `flex`, `eletrico`, `hibrido`, `diesel`, `gasolina`
   - `anoMin` / `anoMax` / `kmMax`
   - `loja` — `nenem-autos`, `rosa-automoveis`, `v3-automoveis`, `manos-veiculos`
   - `limit` — quantidade máxima retornada (padrão `5`, máximo `50`)

   A resposta já inclui **`mensagemProntaWhatsapp`** formatada com negritos, emojis e códigos para o bot enviar direto ao cliente, além do array `veiculos` com `fotoCapa` e `fotos` para enviar imagens!

---

## 2. Atualização Automática do Estoque

Para manter o feirão sempre sincronizado com os 4 sites (ex: a cada 1 hora via n8n Cron ou agendador do servidor):

```bash
curl -X POST "https://SEU-DOMINIO.com.br/api/sync" \
  -H "Authorization: Bearer SEU_SYNC_SECRET"
```

Ou via terminal no servidor:
```bash
npm run sync
```

---

## 3. Exemplo de Prompt de Sistema para Agente de IA (n8n / OpenAI / Gemini)

```text
Você é o assistente virtual oficial do Feirão 4 Lojas de Rio do Sul - SC (Neném Autos, Rosa Automóveis, V3 Automóveis e Manos Veículos).
Seu objetivo é tirar todas as dúvidas sobre os veículos disponíveis, enviar fotos/detalhes, simular interesse em financiamento ou troca e agendar a visita do cliente.

Regras:
1. Sempre consulte a API antes de afirmar preço, ano, km ou disponibilidade:
   - Se a mensagem do cliente trouxer um código (ex: NA-001, V3-005, MV-012, RA-002), chame GET /api/veiculos/{codigo}.
   - Se o cliente procurar por perfil/modelo/orçamento, chame GET /api/chatbot/buscar com os filtros adequados.
   - Se o cliente perguntar o que tem no geral, chame GET /api/chatbot/resumo.
2. Nunca invente veículos ou preços que não estejam retornados pela API.
3. Seja cordial, direto e persuasivo, sempre incentivando o próximo passo (simulação de financiamento, avaliação de usado na troca ou visita à loja).
```
