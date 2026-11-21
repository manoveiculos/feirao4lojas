# Feirão 4 Lojas — Rio do Sul / SC

Página única de alta conversão para o feirão unificado das 4 lojas (**Neném Autos**, **Rosa Automóveis**, **V3 Automóveis** e **Manos Veículos**), com extrator automático de estoque e API REST pronta para integração com chatbot de WhatsApp.

## Como rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente (.env.local)
# Edite NEXT_PUBLIC_WHATSAPP_NUMBER com o WhatsApp oficial do feirão (ex: 5547999999999)

# 3. Extrair / atualizar o estoque das 4 lojas
npm run sync

# 4. Iniciar o servidor
npm run dev
```

Acesse:
- **Página do Feirão:** `http://localhost:3000`
- **Painel Interativo da API do Chatbot:** `http://localhost:3000/api-docs`

## Endpoints da API para o Chatbot do WhatsApp

| Método | Endpoint | Uso no Chatbot |
| --- | --- | --- |
| `GET` | `/api/chatbot/resumo` | Retorna resumo geral + catálogo compacto de **todos os carros** das 4 lojas |
| `GET` | `/api/chatbot/buscar` | Busca inteligente (`q`, `codigo`, `orcamento`, `marca`, `categoria`, `cambio`, `combustivel`, `loja`, `limit`) com `mensagemProntaWhatsapp` |
| `GET` | `/api/veiculos` | Listagem completa com filtros e paginação (`?formato=compacto` opcional) |
| `GET` | `/api/veiculos/[codigo-ou-id]` | Ficha completa, todas as fotos e opcionais pelo código (ex: `NA-001`, `V3-001`, `MV-001`, `RA-001`) |
| `GET` | `/api/lojas` | Informações e contagem de carros das 4 lojas |
| `POST` | `/api/sync` | Re-extrai os 4 sites sob demanda (header `Authorization: Bearer <SYNC_SECRET>`) |
