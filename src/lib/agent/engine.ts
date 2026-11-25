import { z } from 'zod';
import { FEIRAO_CONFIG, HORARIO_FEIRAO } from '../config';
import {
  addEvento,
  addMensagem,
  getLead,
  getMensagens,
  getSettings,
  updateLead,
} from '../db/store';
import type { Lead } from '../db/types';
import { loadEstoque } from '../estoque';
import { filterVeiculos } from '../filters';
import {
  enviarImagem,
  enviarTexto,
  limparTextoCliente,
  marcarProximoFollowup,
  quebrarEmBaloes,
} from '../whatsapp/outbound';
import { imagemParaClaude } from '../whatsapp/midia';
import { avisarVisita, criteriosMinimos, reavaliarLead } from './qualificacao';
import { avisarAdminHumano, notificarLoja, rotearLead } from './roteador';
import { cadastrarEspera, marcarEsperaEmAtendimento } from '../espera/espera';
import { LOJAS_BY_SLUG } from '../config';
import { promptBase, promptLead } from './prompt';
import type { Veiculo } from '../types';

// ───────────────────────── Definição das tools ─────────────────────────

const TOOLS = [
  {
    name: 'consultar_estoque',
    description:
      'Busca carros reais no estoque consolidado das 4 lojas. Use SEMPRE antes de citar preço/ano/km/disponibilidade. Retorna até 5 veículos (até 8 com limite) do mais barato ao mais caro. Quando o cliente pedir um MODELO, busque só pelo modelo (q), SEM orcamento_max: mostre o que ele pediu, seja qual for o preço. Use orçamento só quando ele pedir "algo até X". Se voltar vazio, ofereça alternativas e/ou cadastrar_lista_espera.',
    input_schema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Texto livre: modelo, marca, cor. Ex: "corolla", "strada", "branco automatico"' },
        codigo: { type: 'string', description: 'Código do carro, ex: NA-001' },
        categoria: { type: 'string', enum: ['suv', 'sedan', 'hatch', 'picape', 'moto', 'utilitario'] },
        orcamento_max: { type: 'number', description: 'Preço máximo em reais' },
        orcamento_min: { type: 'number' },
        cambio: { type: 'string', enum: ['automatico', 'manual'] },
        ano_min: { type: 'number' },
        km_max: { type: 'number' },
        limite: { type: 'number', description: 'Padrão 5, máximo 8' },
      },
    },
  },
  {
    name: 'enviar_fotos',
    description:
      'Envia ao cliente, pelo WhatsApp, as fotos e a ficha de um carro (até 4 fotos). Use quando o cliente demonstrar interesse em um carro específico.',
    input_schema: {
      type: 'object',
      properties: {
        codigo: { type: 'string', description: 'Código do carro, ex: V3-005' },
        quantidade: { type: 'number', description: 'De 1 a 4. Padrão 4.' },
      },
      required: ['codigo'],
    },
  },
  {
    name: 'enviar_convite_feirao',
    description:
      'Envia a arte oficial do ACELERA V3 com o convite (datas, local e benefícios). Use UMA vez por cliente, quando ele já demonstrou interesse real.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'atualizar_ficha_lead',
    description:
      'Preenche a ficha lateral do lead no painel (interesse, orçamento, entrada, parcela, pagamento, troca, prazo) e recalcula o lead_score. Chame sempre que obtiver informação nova. Só preencha o que o cliente realmente disse.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string' },
        categoria: { type: 'string', description: 'suv, sedan, hatch, picape, moto...' },
        marca_modelo: { type: 'string' },
        veiculos_interesse: { type: 'array', items: { type: 'string' }, description: 'Códigos, ex: ["NA-001"]' },
        orcamento: { type: 'number', description: 'Valor total que pretende pagar em reais' },
        entrada: { type: 'number', description: 'Valor de entrada em reais (0 se não tem)' },
        parcela_desejada: { type: 'number' },
        forma_pagamento: { type: 'string', enum: ['financiamento', 'avista', 'consorcio'] },
        tem_troca: { type: 'boolean' },
        troca_modelo: { type: 'string' },
        troca_ano: { type: 'string' },
        troca_km: { type: 'string' },
        prazo_compra: { type: 'string', enum: ['imediato', 'ate_7_dias', 'ate_30_dias', 'mais_30_dias'] },
        cidade: { type: 'string' },
        resumo: {
          type: 'string',
          description: 'Resumo de 1–2 frases para o vendedor da loja: o que o cliente quer e em que ponto está.',
        },
      },
    },
  },
  {
    name: 'agendar_visita',
    description: 'Registra a visita combinada com o cliente ao feirão/loja.',
    input_schema: {
      type: 'object',
      properties: {
        data_hora_iso: {
          type: 'string',
          description: 'Data e hora no fuso de Brasília em ISO 8601, ex: 2026-12-16T10:30:00-03:00',
        },
        descricao: { type: 'string', description: 'Texto amigável, ex: "terça 16/12 às 10h30"' },
        loja: { type: 'string', enum: ['nenem-autos', 'rosa-automoveis', 'v3-automoveis', 'manos-veiculos'], description: 'Opcional: loja do carro de interesse' },
      },
      required: ['descricao'],
    },
  },
  {
    name: 'enviar_localizacao',
    description:
      'Envia o endereço do feirão com o link do Google Maps. Use SOMENTE quando o cliente perguntar onde fica, pedir o endereço, a localização ou como chegar.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cadastrar_lista_espera',
    description:
      'Coloca o cliente na lista de espera prioritária quando consultar_estoque não encontrou nada compatível com o que ele quer. Ele será chamado automaticamente assim que entrar um carro compatível. Também use para atualizar o pedido (ex.: cliente recusou o carro avisado e quer outro perfil). Informe pelo menos modelo ou categoria.',
    input_schema: {
      type: 'object',
      properties: {
        marca: { type: 'string', description: 'Ex: "Toyota"' },
        modelo: { type: 'string', description: 'Modelo desejado, ex: "Corolla Cross", "HB20S"' },
        categoria: { type: 'string', enum: ['suv', 'sedan', 'hatch', 'picape', 'moto', 'utilitario'] },
        ano_minimo: { type: 'number', description: 'Ano mínimo aceito' },
        preco_maximo: { type: 'number', description: 'Valor máximo em reais que o cliente pagaria' },
        cambio: { type: 'string', enum: ['automatico', 'manual'] },
        tem_troca: { type: 'boolean' },
        observacoes: { type: 'string', description: 'Detalhes extras: cor, km máximo, versão, uso' },
      },
    },
  },
  {
    name: 'aprovar_para_roteamento',
    description:
      'Aprova o lead triado e aciona o Agente Roteador, que escolhe a loja responsável e avisa o vendedor no WhatsApp. Chame SOMENTE quando o cliente respondeu ativamente E (tem interesse claro + orçamento/entrada/parcela/forma de pagamento ou troca definida) OU pediu explicitamente visita, simulação, negociação ou falar com um vendedor, OU aceitou o carro avisado pela lista de espera. Nunca chame para curioso, para quem só perguntou preço e sumiu, ou sem resposta do cliente. Antes, registre tudo com atualizar_ficha_lead.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Por que o lead está pronto, em uma frase. Ex: "Quer o Compass 2022, entrada de 30 mil e troca Onix 2019"' },
        resumo: { type: 'string', description: 'Resumo de até 2 linhas para o vendedor: o que o cliente quer e em que ponto está.' },
        codigo_veiculo: { type: 'string', description: 'Código do carro escolhido, se houver (ex: V3-005). Define a loja dona do carro.' },
        pedido_explicito: { type: 'boolean', description: 'true se o cliente pediu visita, simulação, negociação ou vendedor.' },
      },
      required: ['motivo', 'resumo'],
    },
  },
  {
    name: 'transferir_para_humano',
    description:
      'Passa a conversa para um consultor humano e pausa o agente. Use quando o cliente pedir, quiser fechar/negociar, reclamar ou você não souber responder com segurança. O lead é roteado para uma loja (se ainda não foi) e a loja é avisada.',
    input_schema: {
      type: 'object',
      properties: { motivo: { type: 'string', description: 'Motivo em uma frase' } },
      required: ['motivo'],
    },
  },
] as const;

// ───────────────────────── Execução das tools ─────────────────────────

interface Ctx {
  leadId: string;
  simulado: boolean;
}

const lead_ = (c: Ctx) => getLead(c.leadId)!;

function compacto(v: Veiculo) {
  return {
    codigo: v.codigo,
    titulo: v.titulo,
    ano: v.anoTexto,
    preco: v.precoFormatado,
    km: v.kmFormatado,
    cambio: v.cambio,
    combustivel: v.combustivel,
    cor: v.cor,
    categoria: v.categoria,
    loja: v.lojaNome,
    fotos: v.fotos.length,
  };
}

function achar(codigo: string): Veiculo | undefined {
  const c = codigo.trim().toLowerCase();
  return loadEstoque().veiculos.find((v) => v.codigo.toLowerCase() === c);
}

const buscarSchema = z.object({
  q: z.string().optional(),
  codigo: z.string().optional(),
  categoria: z.string().optional(),
  orcamento_max: z.number().optional(),
  orcamento_min: z.number().optional(),
  cambio: z.string().optional(),
  ano_min: z.number().optional(),
  km_max: z.number().optional(),
  limite: z.number().optional(),
});

const atualizarSchema = z.object({
  nome: z.string().optional(),
  categoria: z.string().optional(),
  marca_modelo: z.string().optional(),
  veiculos_interesse: z.array(z.string()).optional(),
  orcamento: z.number().optional(),
  entrada: z.number().optional(),
  parcela_desejada: z.number().optional(),
  forma_pagamento: z.enum(['financiamento', 'avista', 'consorcio']).optional(),
  tem_troca: z.boolean().optional(),
  troca_modelo: z.string().optional(),
  troca_ano: z.string().optional(),
  troca_km: z.string().optional(),
  prazo_compra: z.enum(['imediato', 'ate_7_dias', 'ate_30_dias', 'mais_30_dias']).optional(),
  cidade: z.string().optional(),
  resumo: z.string().optional(),
});

const esperaSchema = z.object({
  marca: z.string().max(60).optional(),
  modelo: z.string().max(80).optional(),
  categoria: z.string().max(30).optional(),
  ano_minimo: z.number().int().min(1950).max(2100).optional(),
  preco_maximo: z.number().positive().optional(),
  cambio: z.enum(['automatico', 'manual']).optional(),
  tem_troca: z.boolean().optional(),
  observacoes: z.string().max(500).optional(),
});

const aprovarSchema = z.object({
  motivo: z.string().max(300),
  resumo: z.string().max(400).optional(),
  codigo_veiculo: z.string().max(20).optional(),
  pedido_explicito: z.boolean().optional(),
});

export async function executarTool(
  nome: string,
  input: Record<string, unknown>,
  ctx: Ctx
): Promise<unknown> {
  switch (nome) {
    case 'consultar_estoque':
    case 'buscar_estoque': {
      const a = buscarSchema.parse(input);
      const db = loadEstoque();
      if (a.codigo) {
        const v = achar(a.codigo);
        return v ? { encontrados: 1, veiculos: [compacto(v)] } : { encontrados: 0, veiculos: [] };
      }
      const lista = filterVeiculos(db.veiculos, {
        q: a.q,
        categoria: a.categoria,
        cambio: a.cambio,
        precoMax: a.orcamento_max,
        precoMin: a.orcamento_min,
        anoMin: a.ano_min,
        kmMax: a.km_max,
        excluirMotos: a.categoria !== 'moto',
        ordenar: 'preco_asc',
      });
      const lim = Math.min(8, Math.max(1, a.limite ?? 5));
      return { encontrados: lista.length, veiculos: lista.slice(0, lim).map(compacto) };
    }

    case 'enviar_fotos': {
      const v = achar(String(input.codigo ?? ''));
      if (!v) return { ok: false, erro: 'Código não encontrado no estoque.' };
      const qtd = Math.min(4, Math.max(1, Number(input.quantidade ?? 4)));
      const fotos = v.fotos.slice(0, qtd);
      if (!fotos.length) return { ok: false, erro: 'Este carro não tem fotos cadastradas.' };
      const lead = lead_(ctx);
      let enviadas = 0;
      for (let i = 0; i < fotos.length; i++) {
        const legenda =
          i === 0
            ? `*${v.titulo}* ${v.anoTexto}\n💰 ${v.precoFormatado} | 🛣️ ${v.kmFormatado} | ⚙️ ${v.cambio}`
            : '';
        const r = await enviarImagem(lead, fotos[i], legenda, { simulado: ctx.simulado });
        if (r.ok) enviadas++;
      }
      const atual = lead_(ctx);
      if (!atual.perfil.veiculosInteresse.includes(v.codigo)) {
        updateLead(atual.id, {
          perfil: { ...atual.perfil, veiculosInteresse: [...atual.perfil.veiculosInteresse, v.codigo].slice(-5) },
        });
      }
      if (!ctx.simulado) addEvento({ tipo: 'fotos_enviadas', leadId: atual.id, lojaSlug: v.lojaSlug, meta: { codigo: v.codigo, qtd: enviadas } });
      await reavaliarLead(atual.id, getLead, { simulado: ctx.simulado });
      return enviadas ? { ok: true, enviadas } : { ok: false, erro: 'Falha no envio das fotos pelo WhatsApp.' };
    }

    case 'enviar_convite_feirao': {
      const lead = lead_(ctx);
      if (lead.conviteEnviadoEm) return { ok: true, observacao: 'Convite já enviado antes; não repita.' };
      const horario = HORARIO_FEIRAO.startsWith('TODO') ? '' : `\n🕘 ${HORARIO_FEIRAO}`;
      const legenda =
        `🚗 *ACELERA V3 — ${FEIRAO_CONFIG.periodo}*\n` +
        `📍 ${FEIRAO_CONFIG.localPrincipal.endereco}${horario}\n\n` +
        `✅ Saia rodando na hora\n✅ Se financiar, 1ª parcela só depois do Carnaval\n✅ Avaliamos seu usado na hora\n✅ Taxas especiais C6 Bank e Viacredi Alto Vale\n\n` +
        // sem link do mapa: o mapa só vai quando o cliente pede o endereço (tool enviar_localizacao)
        `_Condições sujeitas à análise de crédito._`;
      const r = await enviarImagem(lead, `${FEIRAO_CONFIG.siteUrl}${FEIRAO_CONFIG.ogImage}`, legenda, {
        simulado: ctx.simulado,
      }).catch(() => ({ ok: false }));
      // imagem do convite é pública no próprio site (não passa pelo proxy)
      if (!r.ok) await enviarTexto(lead, legenda, { simulado: ctx.simulado });
      updateLead(lead.id, { conviteEnviadoEm: new Date().toISOString() });
      if (!ctx.simulado) addEvento({ tipo: 'convite_enviado', leadId: lead.id, lojaSlug: lead.lojaSlug, meta: {} });
      return { ok: true };
    }

    case 'atualizar_ficha_lead':
    case 'atualizar_lead': {
      const a = atualizarSchema.parse(input);
      const lead = lead_(ctx);
      const p = { ...lead.perfil };
      if (a.categoria) p.categoria = a.categoria.toLowerCase();
      if (a.marca_modelo) p.marca_modelo = a.marca_modelo;
      if (a.veiculos_interesse?.length) {
        const validos = a.veiculos_interesse.map((c) => achar(c)?.codigo).filter(Boolean) as string[];
        p.veiculosInteresse = [...new Set([...p.veiculosInteresse, ...validos])].slice(-5);
      }
      if (a.orcamento !== undefined) p.orcamento = a.orcamento;
      if (a.entrada !== undefined) p.entrada = a.entrada;
      if (a.parcela_desejada !== undefined) p.parcelaDesejada = a.parcela_desejada;
      if (a.forma_pagamento) p.formaPagamento = a.forma_pagamento;
      if (a.tem_troca !== undefined) p.temTroca = a.tem_troca;
      if (a.troca_modelo) p.trocaModelo = a.troca_modelo;
      if (a.troca_ano) p.trocaAno = a.troca_ano;
      if (a.troca_km) p.trocaKm = a.troca_km;
      if (a.prazo_compra) p.prazoCompra = a.prazo_compra;
      if (a.cidade) p.cidade = a.cidade;

      const patch: Partial<Lead> = { perfil: p };
      if (a.nome && a.nome.trim().length > 1) {
        patch.nome = a.nome.trim();
        p.nomeConfirmado = true;
      }
      if (a.resumo) patch.resumo = a.resumo;
      updateLead(lead.id, patch);
      const final = await reavaliarLead(lead.id, getLead, { simulado: ctx.simulado });
      return {
        ok: true,
        score: final?.score,
        temperatura: final?.temperatura,
        roteado: Boolean(final?.roteadoEm),
        aprovavel: final ? criteriosMinimos(final, false) : undefined,
      };
    }

    case 'enviar_localizacao': {
      const lead = lead_(ctx);
      const horario = HORARIO_FEIRAO.startsWith('TODO') ? '' : `\n🕘 ${HORARIO_FEIRAO}`;
      await enviarTexto(
        lead,
        `📍 ${FEIRAO_CONFIG.localPrincipal.referencia}\n${FEIRAO_CONFIG.localPrincipal.endereco}${horario}\n🗺️ ${FEIRAO_CONFIG.localPrincipal.mapsUrl}`,
        { simulado: ctx.simulado }
      );
      return { ok: true, instrucao: 'Endereço e mapa já enviados. Não repita o endereço no texto.' };
    }

    case 'cadastrar_lista_espera': {
      const a = esperaSchema.parse(input);
      const lead = lead_(ctx);
      const { item, atualizado } = cadastrarEspera(lead, {
        marca: a.marca,
        modelo: a.modelo,
        categoria: a.categoria,
        anoMinimo: a.ano_minimo,
        precoMaximo: a.preco_maximo ?? lead.perfil.orcamento,
        cambio: a.cambio,
        temTroca: a.tem_troca,
        observacoes: a.observacoes,
      });
      if (lead.esperaAviso) updateLead(lead.id, { esperaAviso: null });
      return {
        ok: true,
        atualizado,
        pedido: [item.marca, item.modelo, item.categoria, item.anoMinimo ? `a partir de ${item.anoMinimo}` : '', item.precoMaximo ? `até R$ ${item.precoMaximo.toLocaleString('pt-BR')}` : '']
          .filter(Boolean)
          .join(' '),
        instrucao: 'Avise o cliente que ele está na lista prioritária e será chamado aqui no WhatsApp assim que entrar um carro compatível. Não prometa prazo.',
      };
    }

    case 'aprovar_para_roteamento': {
      const a = aprovarSchema.parse(input);
      const lead = lead_(ctx);
      if (a.resumo) updateLead(lead.id, { resumo: a.resumo });
      const codigo = a.codigo_veiculo ? achar(a.codigo_veiculo)?.codigo : undefined;
      if (codigo && !lead.perfil.veiculosInteresse.includes(codigo)) {
        updateLead(lead.id, { perfil: { ...lead.perfil, veiculosInteresse: [...lead.perfil.veiculosInteresse, codigo].slice(-5) } });
      }
      const atual = (await reavaliarLead(lead.id, getLead, { simulado: ctx.simulado }))!;
      if (atual.roteadoEm && atual.lojaSlug) {
        return { ok: true, jaRoteado: true, loja: LOJAS_BY_SLUG[atual.lojaSlug].nome };
      }
      const crit = criteriosMinimos(atual, Boolean(a.pedido_explicito));
      if (!crit.ok) {
        return { ok: false, aprovado: false, faltando: crit.faltando, instrucao: 'Ainda não roteie. Continue a triagem com UMA pergunta curta sobre o que falta.' };
      }
      const espera = atual.esperaAviso;
      const r = await rotearLead(lead.id, {
        motivoAprovacao: a.motivo,
        codigoPreferido: codigo ?? espera?.codigo,
        simulado: ctx.simulado,
      });
      if (r.ok && espera) {
        marcarEsperaEmAtendimento(espera.esperaId);
        updateLead(lead.id, { esperaAviso: null });
      }
      return {
        ok: r.ok,
        aprovado: r.ok,
        loja: r.lojaNome,
        motivo: r.motivo,
        instrucao: r.ok
          ? `Diga ao cliente, de forma natural, que um consultor da ${r.lojaNome} já foi avisado e vai continuar o atendimento por aqui. Continue ajudando até ele assumir.`
          : r.erro,
      };
    }

    case 'agendar_visita': {
      const lead = lead_(ctx);
      const iso = typeof input.data_hora_iso === 'string' ? input.data_hora_iso : '';
      const valido = iso && !Number.isNaN(Date.parse(iso)) ? iso : null;
      const lojaVisita = (input.loja as Lead['lojaSlug']) || lead.lojaSlug || null;
      updateLead(lead.id, {
        visita: { quando: String(input.descricao ?? ''), iso: valido, confirmada: Boolean(valido), lojaSlug: lojaVisita },
        status: 'visita_agendada',
        // a loja da visita é só uma pista para o roteador (a loja responsável quem define é ele)
        ...(lojaVisita && !lead.roteadoEm && !lead.lojaSugerida ? { lojaSugerida: lojaVisita } : {}),
      });
      if (!ctx.simulado) addEvento({ tipo: 'visita_agendada', leadId: lead.id, lojaSlug: lead.lojaSlug, meta: { quando: String(input.descricao ?? '') } });
      const jaNotificado = Boolean(getLead(lead.id)?.lojaNotificadaEm);
      let final = await reavaliarLead(lead.id, getLead, { simulado: ctx.simulado });
      // pedir visita é sinal explícito de compra: aprova para roteamento
      if (final && !final.roteadoEm && criteriosMinimos(final, true).ok) {
        await rotearLead(lead.id, { motivoAprovacao: `visita agendada: ${String(input.descricao ?? '')}`, simulado: ctx.simulado });
        final = getLead(lead.id);
      } else if (final && !ctx.simulado && !final.teste && jaNotificado) {
        await avisarVisita(final);
      }
      marcarProximoFollowup(getLead(lead.id)!);
      return { ok: true, score: final?.score, loja: final?.lojaSlug ? LOJAS_BY_SLUG[final.lojaSlug].nome : null };
    }

    case 'transferir_para_humano': {
      const lead = lead_(ctx);
      const motivo = String(input.motivo ?? '');
      updateLead(lead.id, { humano: true, humanoMotivo: motivo, proximoFollowupEm: null });
      if (!ctx.simulado) addEvento({ tipo: 'handoff_humano', leadId: lead.id, lojaSlug: lead.lojaSlug, meta: { motivo } });

      const atual = getLead(lead.id)!;
      if (!atual.roteadoEm) {
        // pedir atendente é pedido explícito; o roteador escolhe a loja e já avisa
        if (atual.totalMensagensLead > 0) {
          if (!atual.resumo) updateLead(lead.id, { resumo: `Pediu atendimento humano: ${motivo}` });
          await rotearLead(lead.id, { motivoAprovacao: `atendimento humano: ${motivo}`, simulado: ctx.simulado, semGerente: true });
        }
      } else if (!ctx.simulado && !atual.teste) {
        // já roteado: avisa a loja responsável que o cliente aguarda uma pessoa
        await notificarLoja(atual.id, { veiculo: null, motivo: 'veiculo' }, {
          titulo: `🙋 *Cliente aguardando ATENDIMENTO HUMANO — Acelera V3*\nMotivo: ${motivo}`,
          forcar: true,
          semGerente: true,
        });
      }
      // pedido de pessoa SEMPRE chega ao admin, roteado ou não
      if (!ctx.simulado) await avisarAdminHumano(lead.id, motivo);
      const final = getLead(lead.id)!;
      return { ok: true, loja: final.lojaSlug ? LOJAS_BY_SLUG[final.lojaSlug].nome : null };
    }

    default:
      return { ok: false, erro: `Tool desconhecida: ${nome}` };
  }
}

// ───────────────────────── Chamada ao Claude ─────────────────────────

type Bloco =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

interface MsgApi {
  role: 'user' | 'assistant';
  content: string | Bloco[];
}

interface RespostaApi {
  stop_reason: string;
  content: Bloco[];
  error?: { message: string };
}

async function chamarClaude(system: string, dinamico: string, messages: MsgApi[]): Promise<RespostaApi> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY não configurada.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: getSettings().modelo,
      // respostas de WhatsApp são curtas; o teto também segura o "textão"
      max_tokens: 700,
      system: [
        { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: dinamico },
      ],
      tools: TOOLS,
      messages,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await res.json()) as RespostaApi;
  if (!res.ok) throw new Error(json.error?.message || `Anthropic HTTP ${res.status}`);
  return json;
}

/** Quantas fotos do cliente (as mais recentes) o Claude vê de verdade; as anteriores viram só texto. */
const MAX_FOTOS_NO_CONTEXTO = 3;

/** Converte o histórico em turnos alternados user/assistant (com as fotos do cliente como imagem). */
export function montarHistorico(leadId: string, limite = 40): MsgApi[] {
  const msgs = getMensagens(leadId)
    .filter((m) => m.autor !== 'sistema')
    .slice(-limite);
  const fotosVisiveis = new Set(
    msgs
      .filter((m) => m.autor === 'lead')
      .flatMap((m) => m.midias.filter((r) => r.startsWith('midia:') && r.endsWith('.jpg')))
      .slice(-MAX_FOTOS_NO_CONTEXTO)
  );
  const out: Array<{ role: MsgApi['role']; content: Bloco[] }> = [];
  for (const m of msgs) {
    const role: MsgApi['role'] = m.autor === 'lead' ? 'user' : 'assistant';
    const blocos: Bloco[] = [];
    if (role === 'user') {
      for (const ref of m.midias) {
        const img = fotosVisiveis.has(ref) ? imagemParaClaude(ref) : null;
        if (img) blocos.push({ type: 'image', source: { type: 'base64', ...img } });
      }
    }
    let texto = m.texto || (m.midias.length ? (role === 'user' ? '[imagem]' : '[fotos enviadas]') : '');
    if (m.autor === 'humano') texto = `[atendente humano da loja]: ${texto}`;
    if (texto) blocos.push({ type: 'text', text: texto });
    if (!blocos.length) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(...blocos);
    else out.push({ role, content: blocos });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export interface ResultadoAgente {
  respondeu: boolean;
  erro?: string;
  /** O cliente mandou mensagem nova enquanto o agente pensava: nada foi enviado; rode de novo. */
  descartada?: boolean;
}

function idUltimaDoCliente(leadId: string): string | undefined {
  const msgs = getMensagens(leadId);
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].autor === 'lead') return msgs[i].id;
  return undefined;
}

/** Resposta curta no WhatsApp: no máx. 2 balões, sem códigos internos. */
export const MAX_BALOES = 2;

/**
 * Roda o agente para um lead: lê o histórico, deixa o Claude usar as tools
 * e envia as respostas (ou apenas registra, em modo simulado).
 */
export async function responderLead(leadId: string, simulado = false): Promise<ResultadoAgente> {
  const lead = getLead(leadId);
  if (!lead) return { respondeu: false, erro: 'Lead inexistente' };

  const historico = montarHistorico(leadId);
  if (!historico.length || historico[historico.length - 1].role !== 'user') {
    return { respondeu: false };
  }

  const ctx: Ctx = { leadId, simulado };
  const system = promptBase();
  const messages = [...historico];
  const ultimaNoInicio = idUltimaDoCliente(leadId);
  const chegouNova = () => !simulado && idUltimaDoCliente(leadId) !== ultimaNoInicio;
  // Texto só sai no FIM: frases soltas entre uma ferramenta e outra ("vou verificar…") não viram balões.
  let ultimoTexto = '';

  try {
    for (let i = 0; i < 7; i++) {
      if (chegouNova()) return { respondeu: false, descartada: true };
      const resp = await chamarClaude(system, promptLead(getLead(leadId)!), messages);

      const texto = resp.content
        .filter((b): b is Extract<Bloco, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('\n\n')
        .trim();
      if (texto) ultimoTexto = texto;

      const usos = resp.content.filter((b): b is Extract<Bloco, { type: 'tool_use' }> => b.type === 'tool_use');
      if (resp.stop_reason !== 'tool_use' || !usos.length) break;

      messages.push({ role: 'assistant', content: resp.content });
      const resultados: Bloco[] = [];
      for (const u of usos) {
        try {
          const r = await executarTool(u.name, u.input, ctx);
          resultados.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(r) });
        } catch (e) {
          resultados.push({
            type: 'tool_result',
            tool_use_id: u.id,
            content: `Erro: ${e instanceof Error ? e.message : String(e)}`,
            is_error: true,
          });
        }
      }
      messages.push({ role: 'user', content: resultados });
    }

    // o cliente escreveu de novo enquanto o agente pensava: descarta e responde a tudo junto
    if (chegouNova()) return { respondeu: false, descartada: true };
    const limpo = limparTextoCliente(ultimoTexto);
    for (const balao of quebrarEmBaloes(limpo, MAX_BALOES)) {
      await enviarTexto(getLead(leadId)!, balao, { simulado });
    }
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error(`[agente] lead ${leadId}:`, erro);
    addMensagem({
      leadId,
      autor: 'sistema',
      texto: `⚠️ O agente não conseguiu responder (${erro}). Atenda este cliente manualmente.`,
      midias: [],
      waId: '',
    });
    return { respondeu: false, erro };
  }

  if (!simulado) {
    const final = getLead(leadId)!;
    if (!final.humano) marcarProximoFollowup(final);
  }
  return { respondeu: true };
}

