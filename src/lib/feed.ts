import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { FEIRAO_CONFIG } from './config';
import type { Veiculo } from './types';

/** O feed só é servido com FEED_KEY configurada e a mesma chave na URL (?key=). */
export function chaveFeedValida(req: NextRequest): boolean {
  const key = process.env.FEED_KEY;
  if (!key) return false;
  const a = Buffer.from(req.nextUrl.searchParams.get('key') || '');
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function faixaPreco(preco: number): string {
  if (preco <= 50000) return 'ate-50k';
  if (preco <= 80000) return '50k-80k';
  if (preco <= 120000) return '80k-120k';
  if (preco <= 180000) return '120k-180k';
  return 'acima-180k';
}

/** Só entram no catálogo carros com preço e foto. */
export function veiculosDoFeed(veiculos: Veiculo[]): Veiculo[] {
  return veiculos.filter((v) => v.preco && v.fotoCapa && v.fotos.length > 0);
}

/** Fotos convertidas para JPEG pelo proxy do site (WebP não é aceito em todos os posicionamentos). */
export const fotoJpeg = (url: string) => `${FEIRAO_CONFIG.siteUrl}/api/media/foto?u=${encodeURIComponent(url)}`;

export function linkVeiculo(v: Veiculo): string {
  const q = new URLSearchParams({
    carro: v.codigo,
    utm_source: 'facebook',
    utm_medium: 'paid',
    utm_campaign: 'catalogo',
    utm_content: v.codigo,
  });
  return `${FEIRAO_CONFIG.siteUrl}/?${q}`;
}

export function descricaoVeiculo(v: Veiculo): string {
  return [
    `${v.titulo} ${v.anoTexto}`,
    v.kmFormatado,
    v.cambio,
    v.combustivel,
    v.cor,
    `Disponível no feirão ACELERA V3 (${FEIRAO_CONFIG.periodo}) em Rio do Sul/SC — ${v.lojaNome}.`,
  ]
    .filter(Boolean)
    .join(' • ')
    .slice(0, 4900);
}

export function rotulos(v: Veiculo): [string, string, string, string, string] {
  return [
    v.lojaNome, // custom_label_0 → conjunto por loja
    v.categoria, // custom_label_1 → por categoria
    faixaPreco(v.preco as number), // custom_label_2 → por faixa de preço
    v.pronta_entrega ? 'pronta-entrega' : 'estoque', // custom_label_3
    v.anoModelo && v.anoModelo >= new Date().getFullYear() - 3 ? 'seminovo-recente' : 'usado', // custom_label_4
  ];
}

export function xmlEsc(s: unknown): string {
  return String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
