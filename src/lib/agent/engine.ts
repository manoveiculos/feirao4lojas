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
  marcarProximoFollowup,
  quebrarEmBaloes,
} from '../whatsapp/outbound';
import { avisarVisita, notificarLojaQualificado, reavaliarLead } from './qualificacao';
import { promptBase, promptLead } from './prompt';
import type { Veiculo } from '../types';

// ───────────────────────── Definição das tools ─────────────────────────

const TOOLS = [
  {
    name: 'buscar_estoque',
    description:
      'Busca carros reais no estoque das 4 lojas. Use SEMPRE antes de citar preço/ano/km. Retorna até 5 veículos ordenados do mais barato ao mais caro.',
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
    name: 'atualizar_lead',
    description:
      'Registra no CRM o que você descobriu sobre o cliente. Chame sempre que obtiver informação nova. Só preencha o que o cliente realmente disse.',
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
    name: 'transferir_para_humano',
    description:
      'Passa a conversa para um consultor humano da loja e pausa o agente. Use quando o cliente pedir, quiser fechar/negociar, reclamar ou você não souber responder com segurança.',
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

export async function executarTool(
  nome: string,
  input: Record<string, unknown>,
  ctx: Ctx
): Promise<unknown> {
  switch (nome) {
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
            ? `*${v.titulo}* ${v.anoTexto}\n💰 ${v.precoFormatado} | 🛣️ ${v.kmFormatado} | ⚙️ ${v.cambio}\n🔖 Cód: ${v.codigo} — ${v.lojaNome}`
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
      await reavaliarLead(atual.id, getLead);
      return enviadas ? { ok: true, enviadas } : { ok: false, erro: 'Falha no envio das fotos pelo WhatsApp.' };
    }

    case 'enviar_convite_feirao': {
      const lead = lead_(ctx);
      if (lead.conviteEnviadoEm) return { ok: true, observacao: 'Convite já enviado antes; não repita.' };
      const horario = HORARIO_FEIRAO.startsWith('TODO') ? '' : `\n🕘 ${HORARIO_FEIRAO}`;
      const legenda =
        `🚗 *ACELERA V3 — ${FEIRAO_CONFIG.periodo}*\n` +
        `📍 ${FEIRAO_CONFIG.localPrincipal.endereco}${horario}\n\n` +
        `✅ Saia rodando na hora\n✅ 1ª parcela só depois do Carnaval\n✅ Avaliamos seu usado na hora\n✅ Taxas especiais C6 Bank e Viacredi Alto Vale\n\n` +
        `_Condições sujeitas à análise de crédito._\n🗺️ ${FEIRAO_CONFIG.localPrincipal.mapsUrl}`;
      const r = await enviarImagem(lead, `${FEIRAO_CONFIG.siteUrl}${FEIRAO_CONFIG.ogImage}`, legenda, {
        simulado: ctx.simulado,
      }).catch(() => ({ ok: false }));
      // imagem do convite é pública no próprio site (não passa pelo proxy)
      if (!r.ok) await enviarTexto(lead, legenda, { simulado: ctx.simulado });
      updateLead(lead.id, { conviteEnviadoEm: new Date().toISOString() });
      if (!ctx.simulado) addEvento({ tipo: 'convite_enviado', leadId: lead.id, lojaSlug: lead.lojaSlug, meta: {} });
      return { ok: true };
    }

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
      const final = await reavaliarLead(lead.id, getLead);
      return { ok: true, score: final?.score, temperatura: final?.temperatura, qualificado: Boolean(final?.qualificadoEm) };
    }

    case 'agendar_visita': {
      const lead = lead_(ctx);
      const iso = typeof input.data_hora_iso === 'string' ? input.data_hora_iso : '';
      const valido = iso && !Number.isNaN(Date.parse(iso)) ? iso : null;
      const loja = (input.loja as Lead['lojaSlug']) || lead.lojaSlug;
      updateLead(lead.id, {
        visita: { quando: String(input.descricao ?? ''), iso: valido, confirmada: Boolean(valido), lojaSlug: loja ?? null },
        status: 'visita_agendada',
        ...(loja && !lead.lojaSlug ? { lojaSlug: loja } : {}),
      });
      if (!ctx.simulado) addEvento({ tipo: 'visita_agendada', leadId: lead.id, lojaSlug: loja ?? lead.lojaSlug, meta: { quando: String(input.descricao ?? '') } });
      const jaNotificado = Boolean(getLead(lead.id)?.lojaNotificadaEm);
      const final = await reavaliarLead(lead.id, getLead);
      if (final && !ctx.simulado && !final.teste && jaNotificado) await avisarVisita(final);
      marcarProximoFollowup(getLead(lead.id)!);
      return { ok: true, score: final?.score };
    }

    case 'transferir_para_humano': {
      const lead = lead_(ctx);
      updateLead(lead.id, {
        humano: true,
        humanoMotivo: String(input.motivo ?? ''),
        proximoFollowupEm: null,
        lojaSlug: lead.lojaSlug,
      });
      if (!ctx.simulado) {
        addEvento({ tipo: 'handoff_humano', leadId: lead.id, lojaSlug: lead.lojaSlug, meta: { motivo: String(input.motivo ?? '') } });
        const l = getLead(lead.id)!;
        await notificarLojaQualificado(
          { ...l, resumo: `${l.resumo} — Motivo: ${String(input.motivo ?? '')}`.trim() },
          '🙋 *Cliente aguardando ATENDIMENTO HUMANO — Acelera V3*'
        );
      }
      return { ok: true };
    }

    default:
      return { ok: false, erro: `Tool desconhecida: ${nome}` };
  }
}

// ───────────────────────── Chamada ao Claude ─────────────────────────

type Bloco =
  | { type: 'text'; text: string }
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
      max_tokens: 1024,
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

/** Converte o histórico em turnos alternados user/assistant. */
export function montarHistorico(leadId: string, limite = 40): MsgApi[] {
  const msgs = getMensagens(leadId)
    .filter((m) => m.autor !== 'sistema')
    .slice(-limite);
  const out: MsgApi[] = [];
  for (const m of msgs) {
    const role: MsgApi['role'] = m.autor === 'lead' ? 'user' : 'assistant';
    let texto = m.texto || (m.midias.length ? '[imagem enviada]' : '');
    if (!texto) continue;
    if (m.autor === 'humano') texto = `[atendente humano da loja]: ${texto}`;
    const last = out[out.length - 1];
    if (last && last.role === role && typeof last.content === 'string') last.content += `\n${texto}`;
    else out.push({ role, content: texto });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export interface ResultadoAgente {
  respondeu: boolean;
  erro?: string;
}

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

  try {
    for (let i = 0; i < 7; i++) {
      const resp = await chamarClaude(system, promptLead(getLead(leadId)!), messages);

      const texto = resp.content
        .filter((b): b is Extract<Bloco, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('\n\n')
        .trim();

      if (texto) {
        for (const balao of quebrarEmBaloes(texto)) {
          await enviarTexto(getLead(leadId)!, balao, { simulado });
        }
      }

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

