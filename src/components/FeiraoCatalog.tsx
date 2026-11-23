'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  Calendar,
  Camera,
  Car,
  Cog,
  CreditCard,
  Filter,
  Fuel,
  Gauge,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Store,
  X,
  Zap,
} from 'lucide-react';
import {
  buildGeneralWhatsappMessage,
  buildVehicleWhatsappMessage,
  buildWhatsappUrl,
  FEIRAO_CONFIG,
} from '@/lib/config';
import { filterVeiculos } from '@/lib/filters';
import type {
  EstoqueMetadata,
  FiltroVeiculos,
  LojaInfo,
  Veiculo,
} from '@/lib/types';
import { VehicleModal } from './VehicleModal';
import { WhatsappIcon } from './WhatsappIcon';

interface FeiraoCatalogProps {
  veiculos: Veiculo[];
  lojas: LojaInfo[];
  metadata: EstoqueMetadata;
  facets: {
    marcas: { nome: string; quantidade: number }[];
    categorias: { nome: string; quantidade: number }[];
    combustiveis: { nome: string; quantidade: number }[];
    cambios: { nome: string; quantidade: number }[];
  };
}

const PRICE_RANGES = [
  { label: 'Qualquer valor', max: undefined },
  { label: 'Até R$ 60 mil', max: 60000 },
  { label: 'Até R$ 80 mil', max: 80000 },
  { label: 'Até R$ 100 mil', max: 100000 },
  { label: 'Até R$ 130 mil', max: 130000 },
  { label: 'Até R$ 170 mil', max: 170000 },
  { label: 'Até R$ 220 mil', max: 220000 },
];

export function FeiraoCatalog({
  veiculos,
  lojas,
  metadata,
  facets,
}: FeiraoCatalogProps) {
  const [q, setQ] = useState('');
  const [loja, setLoja] = useState('todas');
  const [marca, setMarca] = useState('todas');
  const [categoria, setCategoria] = useState('todas');
  const [cambio, setCambio] = useState('todos');
  const [combustivel, setCombustivel] = useState('todos');
  const [precoMax, setPrecoMax] = useState<number | undefined>(undefined);
  const [ordenar, setOrdenar] =
    useState<FiltroVeiculos['ordenar']>('destaque');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);
  const [selectedVehicle, setSelectedVehicle] = useState<Veiculo | null>(null);
  const [customWish, setCustomWish] = useState('');

  // Lock background scroll while mobile filter drawer is open
  useEffect(() => {
    if (!showMobileFilters) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMobileFilters(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [showMobileFilters]);

  const filtered = useMemo(() => {
    return filterVeiculos(veiculos, {
      q,
      loja,
      marca,
      categoria,
      cambio,
      combustivel,
      precoMax,
      ordenar,
    });
  }, [veiculos, q, loja, marca, categoria, cambio, combustivel, precoMax, ordenar]);

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    if (q.trim()) {
      chips.push({
        key: 'q',
        label: `"${q.trim()}"`,
        onRemove: () => setQ(''),
      });
    }
    if (loja !== 'todas') {
      const storeName = lojas.find((l) => l.slug === loja)?.nome || loja;
      chips.push({
        key: 'loja',
        label: storeName,
        onRemove: () => setLoja('todas'),
      });
    }
    if (marca !== 'todas') {
      chips.push({
        key: 'marca',
        label: marca,
        onRemove: () => setMarca('todas'),
      });
    }
    if (categoria !== 'todas') {
      chips.push({
        key: 'categoria',
        label: categoria,
        onRemove: () => setCategoria('todas'),
      });
    }
    if (cambio !== 'todos') {
      chips.push({
        key: 'cambio',
        label: cambio,
        onRemove: () => setCambio('todos'),
      });
    }
    if (combustivel !== 'todos') {
      chips.push({
        key: 'combustivel',
        label: combustivel,
        onRemove: () => setCombustivel('todos'),
      });
    }
    if (precoMax !== undefined) {
      chips.push({
        key: 'precoMax',
        label: `Até R$ ${Math.round(precoMax / 1000)} mil`,
        onRemove: () => setPrecoMax(undefined),
      });
    }
    return chips;
  }, [q, loja, lojas, marca, categoria, cambio, combustivel, precoMax]);

  const activeFilterCount = activeFilterChips.length;
  const hasActiveFilters = activeFilterCount > 0;

  const clearFilters = () => {
    setQ('');
    setLoja('todas');
    setMarca('todas');
    setCategoria('todas');
    setCambio('todos');
    setCombustivel('todos');
    setPrecoMax(undefined);
    setOrdenar('destaque');
    setVisibleCount(24);
  };

  const applyQuickPreset = (preset: {
    categoria?: string;
    cambio?: string;
    combustivel?: string;
    precoMax?: number;
  }) => {
    clearFilters();
    if (preset.categoria) setCategoria(preset.categoria);
    if (preset.cambio) setCambio(preset.cambio);
    if (preset.combustivel) setCombustivel(preset.combustivel);
    if (preset.precoMax) setPrecoMax(preset.precoMax);
    document.getElementById('estoque')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSelectStore = (slug: string) => {
    setLoja((prev) => (prev === slug ? 'todas' : slug));
    setVisibleCount(24);
    document.getElementById('estoque')?.scrollIntoView({ behavior: 'smooth' });
  };

  const visibleVehicles = filtered.slice(0, visibleCount);
  const waGeneral = buildWhatsappUrl(buildGeneralWhatsappMessage());

  return (
    <div className="min-h-screen overflow-x-clip bg-slate-50 text-slate-900">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 text-white backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3.5 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-amber-500 shadow-lg shadow-red-600/25 sm:h-10 sm:w-10">
              <Car className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-extrabold tracking-tight sm:text-lg">
                  {FEIRAO_CONFIG.nome}
                </span>
                <span className="hidden rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300 ring-1 ring-red-400/30 sm:inline-block">
                  {FEIRAO_CONFIG.cidade}
                </span>
              </div>
              <p className="truncate text-[11px] font-medium text-slate-400">
                <span className="font-bold text-emerald-400">
                  {metadata.totalVeiculos} carros
                </span>{' '}
                • 4 lojas em 1 vitrine
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <a
              href="#estoque"
              className="hidden rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white md:inline-block"
            >
              Ver Estoque
            </a>
            <a
              href="#lojas"
              className="hidden rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white md:inline-block"
            >
              As 4 Lojas
            </a>
            <a
              href={waGeneral}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#25D366] px-3.5 py-2 text-xs font-extrabold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-[#1ebe5d] active:scale-[0.98] sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <WhatsappIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">Atendimento WhatsApp</span>
              <span className="sm:hidden">WhatsApp</span>
            </a>
          </div>
        </div>
      </header>

      {/* High-Impact Hero Section */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        {/* Subtle decorative glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 h-[380px] w-[720px] -translate-x-1/2 rounded-full bg-gradient-to-r from-red-600/25 via-amber-500/15 to-emerald-500/20 blur-3xl"
        />

        <div className="relative mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-6 sm:pb-16 sm:pt-12">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-300 sm:px-4 sm:py-1.5 sm:text-xs">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="truncate">
                {FEIRAO_CONFIG.periodo} • {FEIRAO_CONFIG.cidade}
              </span>
            </div>

            <h1 className="mt-4 text-[26px] font-extrabold leading-[1.15] tracking-tight text-white sm:mt-5 sm:text-5xl lg:text-[54px] lg:leading-[1.08]">
              4 Grandes Lojas Unidas no{' '}
              <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-red-400 bg-clip-text text-transparent">
                Maior Feirão de Carros
              </span>{' '}
              de Rio do Sul
            </h1>

            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 sm:mt-4 sm:text-lg">
              Compare{' '}
              <strong className="text-white">
                {metadata.totalVeiculos} veículos revisados
              </strong>{' '}
              em uma única página. Escolha seu carro e fale direto no WhatsApp
              para fotos, financiamento e avaliação do usado.
            </p>

            {/* Hero Primary Search + WhatsApp CTA (text-base prevents iOS Safari input zoom) */}
            <div className="mx-auto mt-5 flex max-w-3xl flex-col gap-2.5 sm:mt-7 sm:flex-row sm:gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 sm:left-4" />
                <input
                  type="search"
                  enterKeyHint="search"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setVisibleCount(24);
                  }}
                  placeholder="Buscar modelo, marca ou ano..."
                  className="h-13 w-full rounded-2xl border border-white/15 bg-white/10 pl-11 pr-10 text-base text-white placeholder-slate-400 backdrop-blur-md transition focus:border-emerald-400 focus:bg-white/15 focus:outline-none sm:h-14 sm:pl-12"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    aria-label="Limpar busca"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <a
                href={waGeneral}
                target="_blank"
                rel="noopener noreferrer"
                className="relative inline-flex h-13 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-5 text-sm font-extrabold text-white shadow-xl shadow-emerald-500/30 transition hover:bg-[#1ebe5d] active:scale-[0.98] sm:h-14 sm:gap-2.5 sm:px-6 sm:text-base"
              >
                <WhatsappIcon className="h-5 w-5 shrink-0" />
                Receber Ofertas no WhatsApp
              </a>
            </div>

            {/* Quick Category / Budget Pills — horizontal swipe strip on mobile, wrapped centered on desktop */}
            <div className="-mx-4 mt-4 sm:mx-0 sm:mt-5">
              <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0">
                <QuickChip
                  active={!hasActiveFilters}
                  onClick={clearFilters}
                  label={`Todos (${metadata.totalVeiculos})`}
                />
                <QuickChip
                  active={precoMax === 70000}
                  onClick={() => applyQuickPreset({ precoMax: 70000 })}
                  label="Até R$ 70 mil"
                />
                <QuickChip
                  active={categoria === 'SUV'}
                  onClick={() => applyQuickPreset({ categoria: 'SUV' })}
                  label="SUVs"
                />
                <QuickChip
                  active={cambio === 'Automático'}
                  onClick={() => applyQuickPreset({ cambio: 'Automático' })}
                  label="Automáticos"
                />
                <QuickChip
                  active={categoria === 'Picape'}
                  onClick={() => applyQuickPreset({ categoria: 'Picape' })}
                  label="Picapes"
                />
                <QuickChip
                  active={combustivel === 'Elétrico'}
                  onClick={() => applyQuickPreset({ combustivel: 'Elétrico' })}
                  label="Elétricos"
                />
                <QuickChip
                  active={categoria === 'Sedan'}
                  onClick={() => applyQuickPreset({ categoria: 'Sedan' })}
                  label="Sedans"
                />
                <QuickChip
                  active={categoria === 'Hatch'}
                  onClick={() => applyQuickPreset({ categoria: 'Hatch' })}
                  label="Hatches"
                />
              </div>
            </div>
          </div>

          {/* 4 Partner Dealerships Strip (Clickable Filter!) */}
          <div id="lojas" className="mt-7 scroll-mt-24 sm:mt-10">
            <p className="mb-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400 sm:mb-3 sm:text-xs sm:tracking-widest">
              Toque em uma loja para filtrar ou veja todas juntas
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
              {lojas.map((l) => {
                const isSelected = loja === l.slug;
                return (
                  <button
                    key={l.slug}
                    type="button"
                    onClick={() => handleSelectStore(l.slug)}
                    className={`group flex flex-col items-center justify-between rounded-2xl border p-2.5 text-center transition active:scale-[0.98] cursor-pointer sm:p-4 ${
                      isSelected
                        ? 'border-emerald-400 bg-white/15 ring-2 ring-emerald-400/50'
                        : 'border-white/10 bg-white/[0.06] hover:border-white/25 hover:bg-white/[0.11]'
                    }`}
                  >
                    <div
                      className={`flex h-12 w-full items-center justify-center rounded-xl px-2.5 py-2 transition sm:h-16 sm:px-4 sm:py-2.5 ${
                        l.logoTheme === 'light'
                          ? 'bg-white shadow-sm'
                          : 'bg-black/75 ring-1 ring-white/10'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={l.logo}
                        alt={`Logo ${l.nome}`}
                        className="max-h-9 max-w-[115px] object-contain transition duration-300 group-hover:scale-105 sm:max-h-11 sm:max-w-[150px]"
                      />
                    </div>
                    <div className="mt-2 flex w-full items-center justify-center gap-1.5 sm:mt-3">
                      <span
                        className={`truncate text-xs font-bold sm:text-sm ${
                          isSelected ? 'text-emerald-300' : 'text-white'
                        }`}
                      >
                        {l.nome}
                      </span>
                      {isSelected && (
                        <span className="shrink-0 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-extrabold text-slate-950">
                          Ativa
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Conversion Trust Bar */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5 lg:grid-cols-4">
          <TrustItem
            icon={<Store className="h-4 w-4 text-red-600 sm:h-5 sm:w-5" />}
            title="4 Lojas, 1 Página"
            subtitle="Todo estoque reunido"
          />
          <TrustItem
            icon={<CreditCard className="h-4 w-4 text-emerald-600 sm:h-5 sm:w-5" />}
            title="Financiamento"
            subtitle="Simule no WhatsApp"
          />
          <TrustItem
            icon={<RefreshCw className="h-4 w-4 text-amber-600 sm:h-5 sm:w-5" />}
            title="Usado na Troca"
            subtitle="Melhor avaliação local"
          />
          <TrustItem
            icon={<Zap className="h-4 w-4 text-emerald-600 sm:h-5 sm:w-5" />}
            title="Resposta Rápida"
            subtitle="Atendimento imediato"
          />
        </div>
      </section>

      {/* Main Unified Stock Section */}
      <main
        id="estoque"
        className="mx-auto max-w-7xl scroll-mt-16 px-3.5 py-6 sm:px-6 sm:py-10"
      >
        {/* Filter Bar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                <SlidersHorizontal className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-extrabold text-slate-900 sm:text-lg">
                  {filtered.length === metadata.totalVeiculos
                    ? `Todos os ${filtered.length} Veículos`
                    : `${filtered.length} ${filtered.length === 1 ? 'veículo encontrado' : 'veículos encontrados'}`}
                </h2>
                <p className="truncate text-[11px] text-slate-500 sm:text-xs">
                  {loja !== 'todas'
                    ? `Loja: ${lojas.find((l) => l.slug === loja)?.nome}`
                    : 'Estoque unificado das 4 lojas'}
                </p>
              </div>
            </div>

            {/* Desktop Clear / Mobile Action Controls */}
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="hidden items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 lg:inline-flex cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                  Limpar filtros
                </button>
              )}

              {/* Mobile quick sort + filter drawer button */}
              <div className="flex items-center gap-2 lg:hidden">
                <select
                  aria-label="Ordenar veículos"
                  value={ordenar || 'destaque'}
                  onChange={(e) =>
                    setOrdenar(e.target.value as FiltroVeiculos['ordenar'])
                  }
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-700 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="destaque">Destaque</option>
                  <option value="preco_asc">Menor preço</option>
                  <option value="preco_desc">Maior preço</option>
                  <option value="ano_desc">Mais novos</option>
                  <option value="km_asc">Menor KM</option>
                </select>

                <button
                  type="button"
                  onClick={() => setShowMobileFilters(true)}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold transition active:scale-95 cursor-pointer ${
                    activeFilterCount > 0
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-800'
                  }`}
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filtros
                  {activeFilterCount > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-400 px-1.5 text-[10px] font-extrabold text-slate-950">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Desktop Inline Filter Grid */}
          <div className="mt-4 hidden grid-cols-6 gap-3 border-t border-slate-100 pt-4 lg:grid">
            <FilterSelect
              label="Loja"
              value={loja}
              onChange={(v) => {
                setLoja(v);
                setVisibleCount(24);
              }}
              options={[
                { value: 'todas', label: 'Todas as 4 lojas' },
                ...lojas.map((l) => ({
                  value: l.slug,
                  label: l.nome,
                })),
              ]}
            />

            <FilterSelect
              label="Marca"
              value={marca}
              onChange={(v) => {
                setMarca(v);
                setVisibleCount(24);
              }}
              options={[
                { value: 'todas', label: 'Todas as marcas' },
                ...facets.marcas.map((m) => ({
                  value: m.nome,
                  label: `${m.nome} (${m.quantidade})`,
                })),
              ]}
            />

            <FilterSelect
              label="Categoria"
              value={categoria}
              onChange={(v) => {
                setCategoria(v);
                setVisibleCount(24);
              }}
              options={[
                { value: 'todas', label: 'Todas categorias' },
                ...facets.categorias.map((c) => ({
                  value: c.nome,
                  label: `${c.nome} (${c.quantidade})`,
                })),
              ]}
            />

            <FilterSelect
              label="Câmbio"
              value={cambio}
              onChange={(v) => {
                setCambio(v);
                setVisibleCount(24);
              }}
              options={[
                { value: 'todos', label: 'Todos os câmbios' },
                ...facets.cambios.map((c) => ({
                  value: c.nome,
                  label: `${c.nome} (${c.quantidade})`,
                })),
              ]}
            />

            <FilterSelect
              label="Valor Máximo"
              value={precoMax ? String(precoMax) : 'todos'}
              onChange={(v) => {
                setPrecoMax(v === 'todos' ? undefined : Number(v));
                setVisibleCount(24);
              }}
              options={PRICE_RANGES.map((r) => ({
                value: r.max ? String(r.max) : 'todos',
                label: r.label,
              }))}
            />

            <FilterSelect
              label="Ordenar por"
              value={ordenar || 'destaque'}
              onChange={(v) =>
                setOrdenar(v as FiltroVeiculos['ordenar'])
              }
              options={[
                { value: 'destaque', label: 'Destaque (4 Lojas)' },
                { value: 'preco_asc', label: 'Menor preço' },
                { value: 'preco_desc', label: 'Maior preço' },
                { value: 'ano_desc', label: 'Mais novos' },
                { value: 'km_asc', label: 'Menor KM' },
              ]}
            />
          </div>

          {/* Active removable filter chips */}
          {hasActiveFilters && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onRemove}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white transition hover:bg-slate-700 cursor-pointer"
                >
                  <span>{chip.label}</span>
                  <X className="h-3.5 w-3.5 text-slate-300" />
                </button>
              ))}
              <button
                type="button"
                onClick={clearFilters}
                className="px-2 py-1 text-xs font-bold text-red-600 hover:underline cursor-pointer"
              >
                Limpar tudo
              </button>
            </div>
          )}
        </div>

        {/* Empty State */}
        {filtered.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white px-5 py-12 text-center shadow-sm sm:mt-8 sm:px-6 sm:py-14">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 sm:h-16 sm:w-16">
              <Car className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
            <h3 className="mt-4 text-lg font-extrabold text-slate-900 sm:text-xl">
              Nenhum veículo encontrado com esses filtros
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              Nosso estoque gira todos os dias nas 4 lojas. Fale no WhatsApp
              agora e nossa equipe procura o carro ideal pra você!
            </p>
            <div className="mt-6 flex flex-col items-stretch justify-center gap-2.5 sm:flex-row sm:items-center sm:gap-3">
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-[46px] rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
              >
                Ver todos os {metadata.totalVeiculos} carros
              </button>
              <a
                href={buildWhatsappUrl(
                  buildGeneralWhatsappMessage(
                    q ||
                      `${marca !== 'todas' ? marca : ''} ${categoria !== 'todas' ? categoria : ''}`.trim()
                  )
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-[#1ebe5d]"
              >
                <WhatsappIcon className="h-5 w-5" />
                Pedir Ajuda no WhatsApp
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* Vehicles Grid */}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:mt-6 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              {visibleVehicles.map((v) => (
                <VehicleCard
                  key={v.id}
                  veiculo={v}
                  onOpenDetails={() => setSelectedVehicle(v)}
                />
              ))}
            </div>

            {/* Load More */}
            {visibleCount < filtered.length && (
              <div className="mt-8 flex flex-col items-center gap-3 sm:mt-10">
                <p className="text-xs font-medium text-slate-500 sm:text-sm">
                  Exibindo <strong>{visibleVehicles.length}</strong> de{' '}
                  <strong>{filtered.length}</strong> veículos disponíveis
                </p>
                <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:justify-center sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + 24)}
                    className="min-h-[48px] rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-extrabold text-white shadow-md transition hover:bg-slate-800 active:scale-[0.98] cursor-pointer"
                  >
                    Carregar mais veículos
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibleCount(filtered.length)}
                    className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 active:scale-[0.98] cursor-pointer"
                  >
                    Mostrar todos ({filtered.length})
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* High-Conversion Concierge CTA Banner */}
        <section className="mt-10 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-2xl sm:mt-14 sm:p-10">
          <div className="grid items-center gap-6 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/30">
                <Sparkles className="h-3.5 w-3.5" />
                Atendimento Inteligente no WhatsApp
              </div>
              <h2 className="mt-3 text-xl font-extrabold leading-tight sm:text-3xl">
                Quer ajuda para escolher o carro ideal dentro do seu orçamento?
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-300 sm:text-base">
                Diga qual modelo você procura, quanto quer dar de entrada ou o
                valor da parcela. Nosso atendimento no WhatsApp consulta na hora
                o estoque das{' '}
                <strong className="text-white">4 lojas participantes</strong>!
              </p>

              <div className="mt-4 flex flex-wrap gap-2 sm:mt-5">
                {[
                  'Carros até R$ 70 mil',
                  'SUV automático',
                  'Financiar sem entrada',
                  'Trocar meu usado',
                ].map((prompt) => (
                  <a
                    key={prompt}
                    href={buildWhatsappUrl(buildGeneralWhatsappMessage(prompt))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition hover:border-emerald-400 hover:bg-emerald-500/20 active:scale-95"
                  >
                    {prompt} →
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-md sm:p-5 lg:col-span-5">
              <label
                htmlFor="custom-wish"
                className="block text-xs font-bold uppercase tracking-wider text-emerald-300"
              >
                Qual carro você está procurando?
              </label>
              <input
                id="custom-wish"
                type="text"
                value={customWish}
                onChange={(e) => setCustomWish(e.target.value)}
                placeholder="Ex: Corolla automático até R$ 110 mil..."
                className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-slate-950/60 px-4 text-base text-white placeholder-slate-400 focus:border-emerald-400 focus:outline-none"
              />
              <a
                href={buildWhatsappUrl(
                  buildGeneralWhatsappMessage(customWish.trim() || undefined)
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-[#1ebe5d] active:scale-[0.98]"
              >
                <WhatsappIcon className="h-5 w-5" />
                Consultar Agora no WhatsApp
              </a>
              <p className="mt-2.5 text-center text-[11px] text-slate-400">
                Resposta rápida • Estoque atualizado em tempo real
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer with all 4 Dealerships (extra bottom padding on mobile so sticky bottom bar never overlaps) */}
      <footer className="mt-10 border-t border-slate-200 bg-slate-950 pb-24 text-slate-300 md:pb-0">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
          <div className="flex flex-col justify-between gap-5 border-b border-white/10 pb-8 md:flex-row md:items-center">
            <div>
              <h3 className="text-xl font-extrabold text-white">
                {FEIRAO_CONFIG.nome}
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                4 lojas tradicionais de {FEIRAO_CONFIG.cidade} unidas com
                condições exclusivas de feirão.
              </p>
            </div>
            <a
              href={waGeneral}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#1ebe5d]"
            >
              <WhatsappIcon className="h-5 w-5" />
              Falar com a Central do Feirão
            </a>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-4">
            {lojas.map((l) => (
              <button
                key={l.slug}
                type="button"
                onClick={() => handleSelectStore(l.slug)}
                className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center transition hover:border-white/25 hover:bg-white/[0.08] cursor-pointer"
              >
                <div
                  className={`flex h-12 w-full items-center justify-center rounded-xl px-3 py-1.5 ${
                    l.logoTheme === 'light' ? 'bg-white' : 'bg-black/80'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={l.logo}
                    alt={l.nome}
                    className="max-h-8 max-w-[125px] object-contain"
                  />
                </div>
                <p className="mt-3 text-xs font-bold text-white sm:text-sm">
                  {l.nome}
                </p>
              </button>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-center text-xs text-slate-500 sm:flex-row sm:text-left md:pr-56">
            <p>
              © {new Date().getFullYear()} {FEIRAO_CONFIG.nome} — Todos os
              direitos reservados. Preços e disponibilidade sujeitos a
              alteração.
            </p>
            <Link
              href="/api-docs"
              className="font-semibold text-slate-400 underline-offset-4 transition hover:text-emerald-400 hover:underline"
            >
              API &amp; Integração Chatbot →
            </Link>
          </div>
        </div>
      </footer>

      {/* Mobile Sticky Bottom Action Bar (Filter + WhatsApp) */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 px-3.5 pt-2.5 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur-md md:hidden">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowMobileFilters(true)}
            className="relative inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-4 text-xs font-extrabold text-slate-900 active:scale-95 cursor-pointer"
          >
            <Filter className="h-4 w-4" />
            Filtrar
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-900 px-1.5 text-[10px] font-extrabold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          <a
            href={waGeneral}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-extrabold text-white shadow-lg shadow-emerald-600/30 active:scale-[0.98]"
          >
            <WhatsappIcon className="h-5 w-5 shrink-0" />
            Falar no WhatsApp Agora
          </a>
        </div>
      </div>

      {/* Desktop Floating WhatsApp Button (FAB) */}
      <a
        href={waGeneral}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar no WhatsApp do Feirão"
        className="whatsapp-pulse fixed bottom-6 right-6 z-40 hidden items-center gap-2.5 rounded-full bg-[#25D366] px-5 py-3.5 text-sm font-extrabold text-white shadow-2xl shadow-emerald-600/40 transition hover:scale-105 hover:bg-[#1ebe5d] md:flex"
      >
        <WhatsappIcon className="h-6 w-6" />
        <span>Chamar no WhatsApp</span>
      </a>

      {/* Mobile Bottom-Sheet Filter Drawer */}
      {showMobileFilters && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-slate-950/70 backdrop-blur-xs lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filtrar veículos"
          onClick={() => setShowMobileFilters(false)}
        >
          <div
            className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab handle + Header */}
            <div className="shrink-0 border-b border-slate-200 px-5 pb-3.5 pt-2.5">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Filtrar Veículos
                  </h3>
                  <p className="text-xs text-slate-500">
                    {filtered.length}{' '}
                    {filtered.length === 1
                      ? 'carro encontrado'
                      : 'carros encontrados'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMobileFilters(false)}
                  aria-label="Fechar filtros"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 active:scale-95 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Scrollable mobile filters (16px inputs prevent iOS auto-zoom) */}
            <div className="thin-scrollbar flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
              <FilterSelect
                mobile
                label="Loja Participante"
                value={loja}
                onChange={(v) => {
                  setLoja(v);
                  setVisibleCount(24);
                }}
                options={[
                  { value: 'todas', label: 'Todas as 4 lojas' },
                  ...lojas.map((l) => ({
                    value: l.slug,
                    label: l.nome,
                  })),
                ]}
              />

              <FilterSelect
                mobile
                label="Marca"
                value={marca}
                onChange={(v) => {
                  setMarca(v);
                  setVisibleCount(24);
                }}
                options={[
                  { value: 'todas', label: 'Todas as marcas' },
                  ...facets.marcas.map((m) => ({
                    value: m.nome,
                    label: `${m.nome} (${m.quantidade})`,
                  })),
                ]}
              />

              <FilterSelect
                mobile
                label="Categoria"
                value={categoria}
                onChange={(v) => {
                  setCategoria(v);
                  setVisibleCount(24);
                }}
                options={[
                  { value: 'todas', label: 'Todas categorias' },
                  ...facets.categorias.map((c) => ({
                    value: c.nome,
                    label: `${c.nome} (${c.quantidade})`,
                  })),
                ]}
              />

              <div className="grid grid-cols-2 gap-3">
                <FilterSelect
                  mobile
                  label="Câmbio"
                  value={cambio}
                  onChange={(v) => {
                    setCambio(v);
                    setVisibleCount(24);
                  }}
                  options={[
                    { value: 'todos', label: 'Todos' },
                    ...facets.cambios.map((c) => ({
                      value: c.nome,
                      label: `${c.nome} (${c.quantidade})`,
                    })),
                  ]}
                />

                <FilterSelect
                  mobile
                  label="Combustível"
                  value={combustivel}
                  onChange={(v) => {
                    setCombustivel(v);
                    setVisibleCount(24);
                  }}
                  options={[
                    { value: 'todos', label: 'Todos' },
                    ...facets.combustiveis.map((c) => ({
                      value: c.nome,
                      label: `${c.nome} (${c.quantidade})`,
                    })),
                  ]}
                />
              </div>

              <FilterSelect
                mobile
                label="Valor Máximo"
                value={precoMax ? String(precoMax) : 'todos'}
                onChange={(v) => {
                  setPrecoMax(v === 'todos' ? undefined : Number(v));
                  setVisibleCount(24);
                }}
                options={PRICE_RANGES.map((r) => ({
                  value: r.max ? String(r.max) : 'todos',
                  label: r.label,
                }))}
              />

              <FilterSelect
                mobile
                label="Ordenar por"
                value={ordenar || 'destaque'}
                onChange={(v) =>
                  setOrdenar(v as FiltroVeiculos['ordenar'])
                }
                options={[
                  { value: 'destaque', label: 'Destaque (4 Lojas)' },
                  { value: 'preco_asc', label: 'Menor preço' },
                  { value: 'preco_desc', label: 'Maior preço' },
                  { value: 'ano_desc', label: 'Mais novos' },
                  { value: 'km_asc', label: 'Menor KM' },
                ]}
              />
            </div>

            {/* Sticky Drawer Footer */}
            <div className="safe-bottom flex shrink-0 items-center gap-2.5 border-t border-slate-200 bg-white px-5 pt-3">
              <button
                type="button"
                onClick={clearFilters}
                className="h-12 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 active:scale-95 cursor-pointer"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMobileFilters(false);
                  document
                    .getElementById('estoque')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="h-12 flex-1 rounded-xl bg-slate-950 px-5 text-sm font-extrabold text-white shadow-lg active:scale-[0.98] cursor-pointer"
              >
                Ver {filtered.length}{' '}
                {filtered.length === 1 ? 'veículo' : 'veículos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Detail Modal */}
      <VehicleModal
        veiculo={selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
      />
    </div>
  );
}

function VehicleCard({
  veiculo,
  onOpenDetails,
}: {
  veiculo: Veiculo;
  onOpenDetails: () => void;
}) {
  const waUrl = buildWhatsappUrl(buildVehicleWhatsappMessage(veiculo, 'info'));
  const isElectricOrHybrid =
    veiculo.combustivel === 'Elétrico' || veiculo.combustivel === 'Híbrido';

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl">
      {/* Photo container */}
      <div
        onClick={onOpenDetails}
        className="relative aspect-[16/10] w-full cursor-pointer overflow-hidden bg-slate-900"
      >
        {veiculo.fotoCapa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={veiculo.fotoCapa}
            alt={veiculo.titulo}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-slate-400">
            <Car className="h-10 w-10 opacity-40" />
            <span className="text-xs font-medium">Fotos no WhatsApp</span>
          </div>
        )}

        {/* Top badges */}
        <div className="absolute left-2.5 right-2.5 top-2.5 flex items-start justify-between gap-2 sm:left-3 sm:right-3 sm:top-3">
          <span className="max-w-[70%] truncate rounded-lg bg-slate-950/80 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
            {veiculo.lojaNome}
          </span>
          <span className="shrink-0 rounded-lg bg-white/90 px-2 py-1 text-[10px] font-extrabold tracking-wide text-slate-900 shadow-xs backdrop-blur-sm">
            {veiculo.codigo}
          </span>
        </div>

        {/* Bottom badges */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 sm:left-3 sm:right-3">
          <div className="flex gap-1.5">
            {isElectricOrHybrid && (
              <span className="rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-extrabold uppercase text-white shadow-sm">
                {veiculo.combustivel}
              </span>
            )}
            <span className="rounded-md bg-black/65 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
              {veiculo.categoria}
            </span>
          </div>

          {veiculo.fotos.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
              <Camera className="h-3 w-3" />
              {veiculo.fotos.length}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {veiculo.marca}
          </p>
          <h3
            onClick={onOpenDetails}
            className="mt-0.5 line-clamp-2 min-h-[2.75rem] cursor-pointer text-base font-extrabold leading-snug text-slate-900 transition group-hover:text-emerald-700"
            title={veiculo.titulo}
          >
            {veiculo.titulo}
          </h3>

          {/* Price */}
          <div className="mt-2.5 flex items-baseline justify-between gap-2 sm:mt-3">
            <span className="text-2xl font-extrabold tracking-tight text-slate-950">
              {veiculo.precoFormatado}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
              <BadgeCheck className="h-3.5 w-3.5" />
              Feirão
            </span>
          </div>

          {/* 4 Quick Specs */}
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600 sm:mt-3.5 sm:pt-3.5">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate font-semibold">{veiculo.anoTexto}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate font-semibold">{veiculo.kmFormatado}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Cog className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate font-semibold">{veiculo.cambio}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Fuel className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate font-semibold">{veiculo.combustivel}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons — generous thumb tap targets */}
        <div className="mt-4 flex flex-col gap-2 pt-1.5">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-extrabold text-white shadow-md shadow-emerald-500/20 transition hover:bg-[#1ebe5d] active:scale-[0.98]"
          >
            <WhatsappIcon className="h-4 w-4 shrink-0" />
            Chamar no WhatsApp
          </a>
          <button
            type="button"
            onClick={onOpenDetails}
            className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 active:scale-[0.98] cursor-pointer"
          >
            Ver Fotos ({veiculo.fotos.length}) e Ficha Completa
          </button>
        </div>
      </div>
    </article>
  );
}

function QuickChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold transition active:scale-95 cursor-pointer sm:py-1.5 ${
        active
          ? 'bg-amber-400 text-slate-950 shadow-sm'
          : 'border border-white/15 bg-white/5 text-slate-200 hover:border-white/30 hover:bg-white/15'
      }`}
    >
      {label}
    </button>
  );
}

function TrustItem({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-2.5 sm:gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 sm:h-10 sm:w-10">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-extrabold text-slate-900 sm:text-sm">
          {title}
        </p>
        <p className="truncate text-[11px] text-slate-500 sm:text-xs">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  mobile = false,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  mobile?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-semibold text-slate-800 transition focus:border-emerald-500 focus:bg-white focus:outline-none ${
          mobile ? 'h-12 text-base' : 'h-10 text-xs'
        }`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
