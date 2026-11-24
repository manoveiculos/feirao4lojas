import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FEIRAO_CONFIG } from '@/lib/config';
import { loadEstoque } from '@/lib/estoque';
import type { Veiculo } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUNAS = [
  'id', 'title', 'description', 'availability', 'condition', 'price', 'link',
  'image_link', 'additional_image_link', 'brand', 'google_product_category',
  'custom_label_0', 'custom_label_1', 'custom_label_2', 'custom_label_3', 'custom_label_4',
  'vehicle_make', 'vehicle_model', 'vehicle_year', 'vehicle_mileage', 'vehicle_transmission', 'vehicle_fuel', 'vehicle_color', 'vehicle_body_style',
] as const;

function csv(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function faixa(preco: number): string {
  if (preco <= 50000) return 'ate-50k';
  if (preco <= 80000) return '50k-80k';
  if (preco <= 120000) return '80k-120k';
  if (preco <= 180000) return '120k-180k';
  return 'acima-180k';
}

function ok(req: NextRequest): boolean {
  const key = process.env.FEED_KEY;
  if (!key) return false; // feed só é servido com chave configurada
  const enviado = req.nextUrl.searchParams.get('key') || '';
  const a = Buffer.from(enviado);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

function linha(v: Veiculo): string[] {
  const link = `${FEIRAO_CONFIG.siteUrl}/?carro=${encodeURIComponent(v.codigo)}&utm_source=facebook&utm_medium=paid&utm_campaign=catalogo&utm_content=${encodeURIComponent(v.codigo)}`;
  const descricao = [
    `${v.titulo} ${v.anoTexto}`,
    v.kmFormatado,
    v.cambio,
    v.combustivel,
    v.cor,
    `Disponível no feirão ACELERA V3 (${FEIRAO_CONFIG.periodo}) em Rio do Sul/SC — ${v.lojaNome}.`,
  ]
    .filter(Boolean)
    .join(' • ');
  return [
    v.codigo,
    `${v.titulo} ${v.anoTexto}`.slice(0, 150),
    descricao.slice(0, 4900),
    'in stock',
    'used',
    `${(v.preco as number).toFixed(2)} BRL`,
    link,
    // mesma conversão para JPEG do WhatsApp: formato aceito em qualquer placement
    `${FEIRAO_CONFIG.siteUrl}/api/media/foto?u=${encodeURIComponent(v.fotoCapa)}`,
    v.fotos
      .slice(1, 10)
      .map((f) => `${FEIRAO_CONFIG.siteUrl}/api/media/foto?u=${encodeURIComponent(f)}`)
      .join(','),
    v.marca,
    v.categoria === 'Moto' ? 'Veículos e peças > Veículos > Motocicletas' : 'Veículos e peças > Veículos > Carros, caminhonetes e SUVs',
    v.lojaNome, // custom_label_0 → conjunto por loja
    v.categoria, // custom_label_1 → conjunto por categoria
    faixa(v.preco as number), // custom_label_2 → conjunto por faixa de preço
    v.pronta_entrega ? 'pronta-entrega' : 'estoque', // custom_label_3
    v.anoModelo && v.anoModelo >= new Date().getFullYear() - 3 ? 'seminovo-recente' : 'usado', // custom_label_4
    v.marca,
    v.modelo,
    v.anoModelo ?? v.anoFabricacao ?? '',
    v.km ?? '',
    v.cambio,
    v.combustivel,
    v.cor,
    v.categoria,
  ].map(csv);
}

/**
 * Feed de estoque para o Catálogo da Meta (Anúncios Dinâmicos / Advantage+ catálogo).
 * Cadastre a URL em Gerenciador de Comércio → Catálogo → Fontes de dados → Feed agendado (a cada hora).
 */
export async function GET(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ erro: 'chave inválida ou FEED_KEY não configurada' }, { status: 401 });

  const db = loadEstoque();
  const itens = db.veiculos.filter((v) => v.preco && v.fotoCapa && v.fotos.length > 0);
  const corpo = [COLUNAS.join(','), ...itens.map((v) => linha(v).join(','))].join('\n');

  return new NextResponse('﻿' + corpo, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Total-Itens': String(itens.length),
    },
  });
}
