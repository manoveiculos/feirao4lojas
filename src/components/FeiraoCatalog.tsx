'use client';

import { useMemo, useState } from 'react';
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
  MapPin,
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

  const hasActiveFilters =
    q.trim() !== '' ||
    loja !== 'todas' ||
    marca !== 'todas' ||
    categoria !== 'todas' ||
    cambio !== 'todos' ||
    combustivel !== 'todos' ||
    precoMax !== undefined;

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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 text-white backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-amber-500 shadow-lg shadow-red-600/25">
              <Car className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight sm:text-lg">
                  {FEIRAO_CONFIG.nome}
                </span>
                <span className="hidden rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300 ring-1 ring-red-400/30 sm:inline-block">
                  {FEIRAO_CONFIG.cidade}
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-400">
                <span className="font-bold text-emerald-400">
                  {metadata.totalVeiculos} veículos
                </span>{' '}
                de 4 lojas em uma só vitrine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
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
              className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-[#1ebe5d] active:scale-[0.98] sm:text-sm"
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
          className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-gradient-to-r from-red-600/25 via-amber-500/15 to-emerald-500/20 blur-3xl"
        />

        <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6 sm:pb-16 sm:pt-12">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-1.5 text-xs font-bold text-amber-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              {FEIRAO_CONFIG.periodo} • {FEIRAO_CONFIG.cidade}
            </div>

            <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-[54px] lg:leading-[1.08]">
              4 Grandes Lojas Unidas no{' '}
              <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-red-400 bg-clip-text text-transparent">
                Maior Feirão de Carros
              </span>{' '}
              de Rio do Sul
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Compare{' '}
              <strong className="text-white">
                {metadata.totalVeiculos} veículos revisados e com procedência
              </strong>{' '}
              em uma única página. Escolha seu carro e fale direto no WhatsApp
              para receber fotos, simulação de financiamento e avaliação do seu
              usado na hora.
            </p>

            {/* Hero Primary Search + WhatsApp CTA */}
            <div className="mx-auto mt-7 flex max-w-3xl flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setVisibleCount(24);
                  }}
                  placeholder="Busque por modelo, marca, ano ou cor (ex: Nivus, Strada, BYD...)"
                  className="h-14 w-full rounded-2xl border border-white/15 bg-white/10 pl-12 pr-10 text-sm text-white placeholder-slate-400 backdrop-blur-md transition focus:border-emerald-400 focus:bg-white/15 focus:outline-none sm:text-base"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    aria-label="Limpar busca"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <a
                href={waGeneral}
                target="_blank"
                rel="noopener noreferrer"
                className="relative inline-flex h-14 shrink-0 items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] px-6 text-base font-extrabold text-white shadow-xl shadow-emerald-500/30 transition hover:bg-[#1ebe5d] active:scale-[0.98]"
              >
                <WhatsappIcon className="h-5 w-5" />
                Receber Ofertas no WhatsApp
              </a>
            </div>

            {/* Quick Category / Budget Pills */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
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

          {/* 4 Partner Dealerships Strip (Clickable Filter!) */}
          <div id="lojas" className="mt-10 scroll-mt-24">
            <p className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
              Clique em uma loja para filtrar ou navegue pelo estoque completo
              abaixo
            </p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {lojas.map((l) => {
                const count = metadata.porLoja[l.slug] || 0;
                const isSelected = loja === l.slug;
                return (
                  <button
                    key={l.slug}
                    type="button"
                    onClick={() => handleSelectStore(l.slug)}
                    className={`group flex flex-col items-center justify-between rounded-2xl border p-4 text-center transition cursor-pointer ${
                      isSelected
                        ? 'border-emerald-400 bg-white/15 ring-2 ring-emerald-400/50'
                        : 'border-white/10 bg-white/[0.06] hover:border-white/25 hover:bg-white/[0.11]'
                    }`}
                  >
                    <div
                      className={`flex h-16 w-full items-center justify-center rounded-xl px-4 py-2.5 transition ${
                        l.logoTheme === 'light'
                          ? 'bg-white shadow-sm'
                          : 'bg-black/75 ring-1 ring-white/10'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={l.logo}
                        alt={`Logo ${l.nome}`}
                        className="max-h-11 max-w-[150px] object-contain transition duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="mt-3 flex w-full items-center justify-between gap-2">
                      <span className="truncate text-xs font-bold text-white sm:text-sm">
                        {l.nome}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                          isSelected
                            ? 'bg-emerald-400 text-slate-950'
                            : 'bg-white/10 text-amber-300'
                        }`}
                      >
                        {count} carros
                      </span>
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
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-5 sm:px-6 lg:grid-cols-4">
          <TrustItem
            icon={<Store className="h-5 w-5 text-red-600" />}
            title="4 Lojas, 1 Só Página"
            subtitle="Todo o estoque de Rio do Sul reunido"
          />
          <TrustItem
            icon={<CreditCard className="h-5 w-5 text-emerald-600" />}
            title="Financiamento Facilitado"
            subtitle="Simulação rápida direto no WhatsApp"
          />
          <TrustItem
            icon={<RefreshCw className="h-5 w-5 text-amber-600" />}
            title="Seu Usado na Troca"
            subtitle="Melhor avaliação da região"
          />
          <TrustItem
            icon={<Zap className="h-5 w-5 text-emerald-600" />}
            title="Resposta Imediata"
            subtitle="Atendimento ágil via WhatsApp"
          />
        </div>
      </section>

      {/* Main Unified Stock Section */}
      <main id="estoque" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-8 sm:px-6 sm:py-10">
        {/* Filter Bar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
                <SlidersHorizontal className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900 sm:text-lg">
                  {filtered.length === metadata.totalVeiculos
                    ? `Todos os ${filtered.length} Veículos do Feirão`
                    : `${filtered.length} ${filtered.length === 1 ? 'veículo encontrado' : 'veículos encontrados'}`}
                </h2>
                <p className="text-xs text-slate-500">
                  {loja !== 'todas'
                    ? `Filtrando pela loja: ${lojas.find((l) => l.slug === loja)?.nome}`
                    : 'Mostrando veículos das 4 lojas participantes'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                  Limpar filtros
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowMobileFilters((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 lg:hidden cursor-pointer"
              >
                <Filter className="h-3.5 w-3.5" />
                {showMobileFilters ? 'Ocultar filtros' : 'Filtros'}
              </button>
            </div>
          </div>

          <div
            className={`mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-6 ${
              showMobileFilters ? 'grid' : 'hidden lg:grid'
            }`}
          >
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
                  label: `${l.nome} (${metadata.porLoja[l.slug] || 0})`,
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
        </div>

        {/* Empty State */}
        {filtered.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Car className="h-8 w-8" />
            </div>
            <h3 className="mt-4 text-xl font-extrabold text-slate-900">
              Nenhum veículo encontrado com esses filtros
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              Mas calma! Nosso estoque gira todos os dias nas 4 lojas. Fale no
              WhatsApp agora e nossa equipe procura o carro ideal pra você!
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
              >
                Ver todos os {metadata.totalVeiculos} carros
              </button>
              <a
                href={buildWhatsappUrl(
                  buildGeneralWhatsappMessage(
                    q || `${marca !== 'todas' ? marca : ''} ${categoria !== 'todas' ? categoria : ''}`.trim()
                  )
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-[#1ebe5d]"
              >
                <WhatsappIcon className="h-5 w-5" />
                Pedir Ajuda no WhatsApp
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* Vehicles Grid */}
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="mt-10 flex flex-col items-center gap-3">
                <p className="text-sm font-medium text-slate-500">
                  Exibindo <strong>{visibleVehicles.length}</strong> de{' '}
                  <strong>{filtered.length}</strong> veículos disponíveis
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + 24)}
                    className="rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-extrabold text-white shadow-md transition hover:bg-slate-800 cursor-pointer"
                  >
                    Carregar mais veículos
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibleCount(filtered.length)}
                    className="rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 cursor-pointer"
                  >
                    Mostrar todos ({filtered.length})
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* High-Conversion Concierge CTA Banner */}
        <section className="mt-14 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-2xl sm:p-10">
          <div className="grid items-center gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/30">
                <Sparkles className="h-3.5 w-3.5" />
                Atendimento Inteligente no WhatsApp
              </div>
              <h2 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">
                Quer ajuda para escolher o carro ideal dentro do seu orçamento?
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-300 sm:text-base">
                Diga qual modelo você procura, quanto quer dar de entrada ou o
                valor da parcela que cabe no seu bolso. Nosso atendimento no
                WhatsApp consulta na hora o estoque das{' '}
                <strong className="text-white">4 lojas participantes</strong> e
                te envia as melhores opções!
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  'Carros econômicos até R$ 70 mil',
                  'SUV automático para família',
                  'Simular financiamento sem entrada',
                  'Quero trocar meu carro atual',
                ].map((prompt) => (
                  <a
                    key={prompt}
                    href={buildWhatsappUrl(buildGeneralWhatsappMessage(prompt))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:border-emerald-400 hover:bg-emerald-500/20"
                  >
                    {prompt} →
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-5 backdrop-blur-md lg:col-span-5">
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
                className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-slate-950/60 px-4 text-sm text-white placeholder-slate-400 focus:border-emerald-400 focus:outline-none"
              />
              <a
                href={buildWhatsappUrl(
                  buildGeneralWhatsappMessage(customWish.trim() || undefined)
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-[#1ebe5d]"
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

      {/* Footer with all 4 Dealerships */}
      <footer className="mt-10 border-t border-slate-200 bg-slate-950 text-slate-300">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <div className="flex flex-col justify-between gap-6 border-b border-white/10 pb-8 md:flex-row md:items-center">
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
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#1ebe5d]"
            >
              <WhatsappIcon className="h-5 w-5" />
              Falar com a Central do Feirão
            </a>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {lojas.map((l) => (
              <div
                key={l.slug}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <div
                  className={`flex h-12 w-fit items-center rounded-lg px-3 py-1.5 ${
                    l.logoTheme === 'light' ? 'bg-white' : 'bg-black/80'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={l.logo}
                    alt={l.nome}
                    className="max-h-8 max-w-[120px] object-contain"
                  />
                </div>
                <p className="mt-3 text-sm font-bold text-white">{l.nome}</p>
                <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-400">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                  {l.endereco}
                </p>
                <p className="mt-2 text-xs font-semibold text-emerald-400">
                  {metadata.porLoja[l.slug] || 0} veículos no feirão
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row">
            <p>
              © {new Date().getFullYear()} {FEIRAO_CONFIG.nome} — Todos os
              direitos reservados. Preços e disponibilidade sujeitos a
              alteração sem aviso prévio.
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

      {/* Floating WhatsApp Button (FAB) */}
      <a
        href={waGeneral}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar no WhatsApp do Feirão"
        className="whatsapp-pulse fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-[#25D366] px-5 py-3.5 text-sm font-extrabold text-white shadow-2xl shadow-emerald-600/40 transition hover:scale-105 hover:bg-[#1ebe5d]"
      >
        <WhatsappIcon className="h-6 w-6" />
        <span className="hidden sm:inline">Chamar no WhatsApp</span>
      </a>

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
        <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
          <span className="rounded-lg bg-slate-950/80 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
            {veiculo.lojaNome}
          </span>
          <span className="rounded-lg bg-white/90 px-2 py-1 text-[10px] font-extrabold tracking-wide text-slate-900 shadow-xs backdrop-blur-sm">
            {veiculo.codigo}
          </span>
        </div>

        {/* Bottom badges */}
        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2">
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
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-slate-950">
              {veiculo.precoFormatado}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
              <BadgeCheck className="h-3.5 w-3.5" />
              Feirão
            </span>
          </div>

          {/* 4 Quick Specs */}
          <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3.5 text-xs text-slate-600">
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

        {/* Action Buttons */}
        <div className="mt-4 flex flex-col gap-2 pt-2">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-extrabold text-white shadow-md shadow-emerald-500/20 transition hover:bg-[#1ebe5d] active:scale-[0.98]"
          >
            <WhatsappIcon className="h-4 w-4" />
            Chamar no WhatsApp
          </a>
          <button
            type="button"
            onClick={onOpenDetails}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 cursor-pointer"
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
      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
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
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
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
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 transition focus:border-emerald-500 focus:bg-white focus:outline-none"
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
