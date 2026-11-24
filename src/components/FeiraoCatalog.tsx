'use client';

import { useEffect, useMemo, useState } from 'react';
import { TZDate } from '@date-fns/tz';
import { Drawer } from 'vaul';
import {
  Building2,
  Calendar,
  Camera,
  Car,
  CheckCircle2,
  Clock,
  Cog,
  Filter,
  Fuel,
  Gauge,
  Info,
  Landmark,
  MapPin,
  Navigation,
  Percent,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Store,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CAMPAIGN_COPY,
  CAMPAIGN_TIMEZONE,
  getCampaignState,
  getHeroTitle,
} from '@/lib/campaign';
import {
  buildGeneralWhatsappMessage,
  buildRefCarro,
  buildRefLoja,
  buildStoreWhatsappMessage,
  buildVehicleWhatsappMessage,
  FEIRAO_CONFIG,
  getSiglaFromCodigo,
} from '@/lib/config';
import { filterVeiculos, formatKmDisplay } from '@/lib/filters';
import { triggerWhatsappLead } from '@/lib/tracking';
import type {
  CampaignMode,
  EstoqueMetadata,
  FiltroVeiculos,
  LojaInfo,
  Veiculo,
} from '@/lib/types';
import { CountdownBanner } from './CountdownBanner';
import { SimulatorSection } from './SimulatorSection';
import { TooltipHint, TooltipProviderRoot } from './TooltipHint';
import { TradeInSection } from './TradeInSection';
import { VehicleModal } from './VehicleModal';
import { VipListForm } from './VipListForm';
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
    totalCarros: number;
    totalMotos: number;
    totalEletricos: number;
    totalProntaEntrega: number;
    faixaPreco: {
      min: number;
      max: number;
      maxArredondado: number;
    };
  };
  initialNowIso: string;
  initialIsSimulated: boolean;
  initialSimulationLabel: string | null;
}

function buildPriceRanges(maxArredondado: number) {
  const baseSteps = [60000, 70000, 80000, 100000, 130000, 170000, 220000];
  const steps = baseSteps.filter((v) => v < maxArredondado);
  if (maxArredondado > 0) {
    steps.push(maxArredondado);
  }
  return [
    { label: 'Qualquer valor', max: undefined as number | undefined },
    ...steps.map((val) => ({
      label: `Até R$ ${Math.round(val / 1000)} mil`,
      max: val,
    })),
  ];
}

export function FeiraoCatalog({
  veiculos,
  lojas,
  metadata,
  facets,
  initialNowIso,
  initialIsSimulated,
  initialSimulationLabel,
}: FeiraoCatalogProps) {
  // Date-driven campaign mode (America/Sao_Paulo) hydrated deterministically from SSR (zero mismatch)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const campaignState = useMemo(() => {
    const baseMs = new Date(initialNowIso).getTime();
    const currentBrt = new TZDate(
      baseMs + elapsedSeconds * 1000,
      CAMPAIGN_TIMEZONE
    );
    return getCampaignState(
      currentBrt,
      initialIsSimulated,
      initialSimulationLabel
    );
  }, [
    initialNowIso,
    initialIsSimulated,
    initialSimulationLabel,
    elapsedSeconds,
  ]);

  const isClosed = campaignState.mode === 'encerrado';
  const isPreLaunch = campaignState.mode === 'pre_lancamento';

  // Inventory tabs & filters
  const [activeTab, setActiveTab] = useState<'carros' | 'motos'>('carros');
  const [q, setQ] = useState('');
  const [loja, setLoja] = useState('todas');
  const [marca, setMarca] = useState('todas');
  const [categoria, setCategoria] = useState('todas');
  const [cambio, setCambio] = useState('todos');
  const [combustivel, setCombustivel] = useState('todos');
  const [prontaEntregaOnly, setProntaEntregaOnly] = useState(false);
  const [precoMax, setPrecoMax] = useState<number | undefined>(undefined);
  const [ordenar, setOrdenar] =
    useState<FiltroVeiculos['ordenar']>('destaque');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(18);
  const [selectedVehicle, setSelectedVehicle] = useState<Veiculo | null>(null);

  // Deep link dos anúncios: /?carro=NA-001 abre direto a ficha do carro
  useEffect(() => {
    const codigo = new URLSearchParams(window.location.search).get('carro');
    if (!codigo) return;
    const alvo = veiculos.find((v) => v.codigo.toLowerCase() === codigo.toLowerCase());
    if (alvo) setSelectedVehicle(alvo);
  }, [veiculos]);

  const priceRanges = useMemo(
    () => buildPriceRanges(facets.faixaPreco.maxArredondado),
    [facets.faixaPreco.maxArredondado]
  );

  const filtered = useMemo(() => {
    return filterVeiculos(veiculos, {
      q,
      loja,
      marca,
      categoria: activeTab === 'motos' ? 'todas' : categoria,
      cambio,
      combustivel,
      prontaEntrega: prontaEntregaOnly,
      apenasMotos: activeTab === 'motos',
      excluirMotos: activeTab === 'carros',
      precoMax,
      ordenar,
    });
  }, [
    veiculos,
    q,
    loja,
    marca,
    categoria,
    cambio,
    combustivel,
    prontaEntregaOnly,
    activeTab,
    precoMax,
    ordenar,
  ]);

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    if (q.trim()) {
      chips.push({ key: 'q', label: `"${q.trim()}"`, onRemove: () => setQ('') });
    }
    if (prontaEntregaOnly) {
      chips.push({
        key: 'pe',
        label: 'Pronta entrega',
        onRemove: () => setProntaEntregaOnly(false),
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
    if (activeTab === 'carros' && categoria !== 'todas') {
      chips.push({
        key: 'categoria',
        label: categoria,
        onRemove: () => setCategoria('todas'),
      });
    }
    if (combustivel !== 'todos') {
      chips.push({
        key: 'combustivel',
        label: combustivel,
        onRemove: () => setCombustivel('todos'),
      });
    }
    if (cambio !== 'todos') {
      chips.push({
        key: 'cambio',
        label: cambio,
        onRemove: () => setCambio('todos'),
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
  }, [
    q,
    prontaEntregaOnly,
    loja,
    lojas,
    marca,
    activeTab,
    categoria,
    combustivel,
    cambio,
    precoMax,
  ]);

  const activeFilterCount = activeFilterChips.length;
  const hasActiveFilters = activeFilterCount > 0;

  const clearFilters = () => {
    setQ('');
    setLoja('todas');
    setMarca('todas');
    setCategoria('todas');
    setCambio('todos');
    setCombustivel('todos');
    setProntaEntregaOnly(false);
    setPrecoMax(undefined);
    setOrdenar('destaque');
    setVisibleCount(18);
  };

  const applyQuickPreset = (preset: {
    categoria?: string;
    cambio?: string;
    combustivel?: string;
    precoMax?: number;
    prontaEntrega?: boolean;
  }) => {
    clearFilters();
    setActiveTab('carros');
    if (preset.categoria) setCategoria(preset.categoria);
    if (preset.cambio) setCambio(preset.cambio);
    if (preset.combustivel) setCombustivel(preset.combustivel);
    if (preset.precoMax) setPrecoMax(preset.precoMax);
    if (preset.prontaEntrega) setProntaEntregaOnly(true);
    document.getElementById('estoque')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSelectStore = (slug: string) => {
    setLoja((prev) => (prev === slug ? 'todas' : slug));
    setVisibleCount(18);
    document.getElementById('estoque')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleGeneralWhatsapp = (origem: 'header' | 'hero' | 'flutuante') => {
    toast.success('Abrindo WhatsApp do Acelera V3...');
    triggerWhatsappLead({
      message: buildGeneralWhatsappMessage(),
      tipo: 'geral',
      ref: 'AV3-GERAL',
      loja_sigla: null,
      origem,
    });
  };

  const handleStoreWhatsapp = (store: LojaInfo) => {
    const ref = buildRefLoja(store.sigla);
    toast.success(`Abrindo WhatsApp da ${store.nome}...`);
    triggerWhatsappLead({
      message: buildStoreWhatsappMessage(store),
      tipo: 'loja',
      ref,
      loja_sigla: store.sigla,
      origem: 'lojas',
    });
  };

  const handleCarWhatsapp = (v: Veiculo) => {
    const ref = buildRefCarro(v.codigo);
    const sigla = getSiglaFromCodigo(v.codigo);
    toast.success(`Abrindo WhatsApp sobre o ${v.modelo}...`);
    triggerWhatsappLead({
      message: buildVehicleWhatsappMessage(v),
      tipo: 'carro',
      ref,
      loja_sigla: sigla,
      origem: 'card',
      veiculo: {
        codigo: v.codigo,
        modelo: v.titulo,
        ano: v.anoTexto,
        preco: v.precoFormatado,
      },
    });
  };

  const visibleVehicles = filtered.slice(0, visibleCount);
  const heroTitle = isClosed
    ? CAMPAIGN_COPY.encerradoTitulo
    : getHeroTitle(facets.totalCarros);
  const itemTermPlural = activeTab === 'motos' ? 'motos' : 'carros';
  const itemTermSingular = activeTab === 'motos' ? 'moto' : 'carro';

  return (
    <TooltipProviderRoot>
      <div className="min-h-screen overflow-x-clip bg-slate-50 text-slate-900">
        {/* Top Countdown Banner (date-driven America/Sao_Paulo) */}
        <CountdownBanner state={campaignState} />

        {/* 1) HEADER */}
        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#062835]/95 text-white backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3.5 py-2.5 sm:gap-4 sm:px-6 sm:py-3">
            <a href="#" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-600/30 sm:h-10 sm:w-10">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-base font-black italic tracking-tight text-white sm:text-lg">
                    ACELERA <span className="text-orange-400">V3</span>
                  </span>
                  <span className="hidden text-slate-500 sm:inline">|</span>
                  <span className="hidden text-xs font-semibold text-slate-300 sm:inline">
                    Rio do Sul/SC
                  </span>
                </div>
                <p className="truncate text-[11px] font-medium text-slate-300">
                  4 Lojas • {CAMPAIGN_COPY.periodoCurto}
                </p>
              </div>
            </a>

            <nav
              aria-label="Navegação principal"
              className="hidden items-center gap-1 md:flex"
            >
              <a
                href="#estoque"
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
              >
                Ver carros
              </a>
              <a
                href="#lojas"
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
              >
                As 4 lojas
              </a>
              {!isClosed && (
                <a
                  href="#simulador"
                  className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                  Simular financiamento
                </a>
              )}
            </nav>

            <button
              type="button"
              onClick={() => handleGeneralWhatsapp('header')}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl bg-orange-500 px-3.5 py-2 text-xs font-extrabold text-white shadow-lg shadow-orange-600/25 transition hover:bg-orange-600 active:scale-[0.98] cursor-pointer sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <WhatsappIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>WhatsApp</span>
            </button>
          </div>
        </header>

        {/* 2) HERO */}
        <section className="relative overflow-hidden bg-[#062835] text-white">
          {/* Campaign cinematic background (clean right-weighted artwork, clear left space for text) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={FEIRAO_CONFIG.campaignImage}
            alt="Campanha ACELERA V3 — Feirão de carros em Rio do Sul"
            fetchPriority="high"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[72%_center] sm:object-right"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#041B24]/95 via-[#062835]/80 to-[#062835]/20 sm:from-[#041B24]/92 sm:via-[#062835]/72 sm:to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#041922]/85 via-transparent to-[#041922]/35 sm:from-[#041922]/60"
          />
          {/* Subtle animated orange speed streaks for energetic feel */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="hero-streak absolute left-0 top-[22%] h-[2px] w-72 bg-gradient-to-r from-transparent via-orange-400/70 to-transparent" />
            <div className="hero-streak-delay absolute left-0 top-[68%] h-[2px] w-56 bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />
          </div>

          <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 sm:pb-14 sm:pt-12">
            <div className="grid items-center gap-8 lg:grid-cols-12">
              <div className={isPreLaunch || isClosed ? 'lg:col-span-7' : 'lg:col-span-8'}>
                <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-orange-400/40 bg-orange-500/15 px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wider text-orange-300">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-orange-400" />
                  <span>
                    {isClosed ? 'Edição encerrada' : CAMPAIGN_COPY.selo}
                  </span>
                </div>

                <h1 className="mt-4 text-3xl font-black italic leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[54px]">
                  {heroTitle}
                </h1>

                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-200 sm:text-lg">
                  {isClosed
                    ? CAMPAIGN_COPY.encerradoSubtitulo
                    : CAMPAIGN_COPY.subtitulo}
                </p>

                {/* Primary & Secondary CTAs */}
                {!isClosed ? (
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <a
                      href={isPreLaunch ? '#lista-vip' : '#simulador'}
                      className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 text-base font-extrabold uppercase tracking-wide text-white shadow-xl shadow-orange-600/35 transition hover:bg-orange-600 active:scale-[0.98]"
                    >
                      <Zap className="h-5 w-5 shrink-0" />
                      {CAMPAIGN_COPY.ctaPrincipal}
                    </a>
                    <a
                      href="#estoque"
                      className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-6 py-3.5 text-base font-bold text-white backdrop-blur-sm transition hover:bg-white/20 active:scale-[0.98]"
                    >
                      <Car className="h-5 w-5 shrink-0" />
                      {CAMPAIGN_COPY.ctaSecundario}
                    </a>
                  </div>
                ) : (
                  <div className="mt-6">
                    <a
                      href="#estoque"
                      className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/20"
                    >
                      <Car className="h-5 w-5 shrink-0" />
                      Ver carros disponíveis nas lojas
                    </a>
                  </div>
                )}

                {/* Trust Strip inside Hero */}
                {!isClosed && (
                  <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-slate-100 sm:text-sm">
                    {CAMPAIGN_COPY.faixaConfianca.map((item) => (
                      <li key={item} className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-orange-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Right Column: VIP List Form (PRÉ-LANÇAMENTO or ENCERRADO) */}
              {(isPreLaunch || isClosed) && (
                <div className="lg:col-span-5">
                  <VipListForm
                    variant={isClosed ? 'encerrado' : 'pre_lancamento'}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Legal notice right below Hero */}
          <div className="relative border-t border-white/10 bg-[#041922]/90">
            <p className="mx-auto max-w-7xl px-4 py-2.5 text-[11px] leading-relaxed text-slate-300 sm:px-6">
              {CAMPAIGN_COPY.legal}
            </p>
          </div>
        </section>

        {/* 3) BENEFÍCIOS (4 cards) */}
        {!isClosed && (
          <section className="border-b border-slate-200 bg-white py-8 sm:py-10">
            <div className="mx-auto max-w-7xl px-4 sm:px-6">
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                <BenefitCard
                  icon={<Zap className="h-5 w-5 text-orange-500" />}
                  title="Pronta entrega"
                  description="Carros disponíveis nas 4 lojas de Rio do Sul/SC para você sair rodando."
                />
                <BenefitCard
                  icon={<Calendar className="h-5 w-5 text-[#0B3C4E]" />}
                  title="1ª parcela só depois do Carnaval"
                  description="Mais fôlego para começar o ano com tranquilidade no orçamento."
                />
                <BenefitCard
                  icon={<Percent className="h-5 w-5 text-orange-500" />}
                  title="Taxas especiais C6 e Viacredi"
                  description="Condições negociadas para o feirão, sujeitas à análise de crédito."
                />
                <BenefitCard
                  icon={<RefreshCw className="h-5 w-5 text-[#0B3C4E]" />}
                  title="Seu usado na troca"
                  description="Avaliamos seu carro atual na hora para facilitar o fechamento."
                />
              </div>
            </div>
          </section>
        )}

        {/* 4) BANCOS PARCEIROS */}
        {!isClosed && (
          <section className="border-b border-slate-200 bg-slate-100/70 py-6 sm:py-8">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
              <div className="text-center sm:text-left">
                <p className="text-xs font-extrabold uppercase tracking-widest text-[#0B3C4E]">
                  Parceiros de Financiamento
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {CAMPAIGN_COPY.bancosTexto}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3.5">
                {FEIRAO_CONFIG.bancosParceiros.map((banco) => (
                  <div
                    key={banco.id}
                    style={{ backgroundColor: banco.bgColor }}
                    className="flex h-16 min-w-[185px] items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 px-5 py-2 shadow-sm transition hover:shadow-md"
                  >
                    {banco.logoPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={banco.logoPath}
                        alt={`Logo ${banco.nome}`}
                        loading="lazy"
                        className={banco.imgClass}
                      />
                    ) : (
                      <>
                        <Landmark className="h-4 w-4 text-[#0B3C4E]" />
                        <span className="text-sm font-black tracking-tight text-slate-900">
                          {banco.nome}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 5) SIMULADOR (sem calcular parcela nem inventar taxa) */}
        {!isClosed && <SimulatorSection />}

        {/* 6) ESTOQUE (FILTROS + CARDS) */}
        <main
          id="estoque"
          className="mx-auto max-w-7xl scroll-mt-16 px-3.5 py-8 sm:px-6 sm:py-12"
        >
          {/* Section Header + Carros / Motos Tabs */}
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-orange-600">
                Estoque Unificado • 4 Lojas
              </p>
              <h2 className="mt-1 text-2xl font-black italic tracking-tight text-slate-950 sm:text-3xl">
                Escolha seu próximo carro
              </h2>
            </div>

            {/* Carros vs Motos Tab (Motos separated outside main category filter) */}
            <div
              role="tablist"
              aria-label="Tipo de veículo"
              className="inline-flex w-fit rounded-xl border border-slate-200 bg-white p-1 shadow-xs"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'carros'}
                onClick={() => {
                  setActiveTab('carros');
                  setVisibleCount(18);
                }}
                className={`rounded-lg px-4 py-2 text-xs font-extrabold transition cursor-pointer sm:text-sm ${
                  activeTab === 'carros'
                    ? 'bg-[#062835] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Carros
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'motos'}
                onClick={() => {
                  setActiveTab('motos');
                  setCategoria('todas');
                  setVisibleCount(18);
                }}
                className={`rounded-lg px-4 py-2 text-xs font-extrabold transition cursor-pointer sm:text-sm ${
                  activeTab === 'motos'
                    ? 'bg-[#062835] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Motos ({facets.totalMotos})
              </button>
            </div>
          </div>

          {/* Clickable Store Filter Chips (preserved) */}
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {lojas.map((l) => {
              const isSelected = loja === l.slug;
              return (
                <button
                  key={l.slug}
                  type="button"
                  onClick={() => handleSelectStore(l.slug)}
                  className={`group flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition active:scale-[0.98] cursor-pointer sm:p-3 ${
                    isSelected
                      ? 'border-orange-500 bg-[#062835] text-white ring-2 ring-orange-500/30'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:shadow-xs'
                  }`}
                >
                  <div
                    className={`flex h-10 w-16 shrink-0 items-center justify-center rounded-lg px-1.5 py-1 ${
                      l.logoTheme === 'light'
                        ? 'bg-white ring-1 ring-slate-200'
                        : 'bg-slate-950'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={l.logo}
                      alt={`Logo ${l.nome}`}
                      className="max-h-7 max-w-full object-contain"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-xs font-extrabold sm:text-sm ${
                        isSelected ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {l.nome}
                    </p>
                    <p
                      className={`text-[11px] font-semibold ${
                        isSelected ? 'text-orange-300' : 'text-slate-500'
                      }`}
                    >
                      {isSelected ? 'Filtrando loja' : 'Filtrar loja'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Search + Quick Preset Chips + Filter Bar */}
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-5">
            {/* Fuzzy Search Bar (Fuse.js) */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  enterKeyHint="search"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setVisibleCount(18);
                  }}
                  placeholder="Buscar por marca, modelo ou versão (ex: Corolla, Nivus, Haval, Onix)..."
                  aria-label="Buscar carros por marca, modelo ou versão"
                  className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 pl-11 pr-10 text-base text-slate-900 placeholder-slate-400 transition focus:border-[#0B3C4E] focus:bg-white focus:outline-none sm:text-sm"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    aria-label="Limpar busca"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Mobile sort + Vaul Drawer trigger */}
              <div className="flex items-center gap-2 lg:hidden">
                <select
                  aria-label="Ordenar carros"
                  value={ordenar || 'destaque'}
                  onChange={(e) =>
                    setOrdenar(e.target.value as FiltroVeiculos['ordenar'])
                  }
                  className="h-11 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold text-slate-800 focus:border-[#0B3C4E] focus:outline-none"
                >
                  <option value="destaque">Destaques do feirão</option>
                  <option value="preco_asc">Menor preço</option>
                  <option value="preco_desc">Maior preço</option>
                  <option value="ano_desc">Mais novos</option>
                  <option value="km_asc">Menor km</option>
                </select>

                <button
                  type="button"
                  onClick={() => setMobileFilterOpen(true)}
                  className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold transition active:scale-95 cursor-pointer ${
                    activeFilterCount > 0
                      ? 'bg-[#062835] text-white'
                      : 'border border-slate-300 bg-slate-100 text-slate-900'
                  }`}
                >
                  <Filter className="h-4 w-4" />
                  Filtros
                  {activeFilterCount > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-extrabold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Filter Chips (horizontal swipe on mobile) */}
            {activeTab === 'carros' && (
              <div className="-mx-3.5 mt-3 sm:mx-0">
                <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-3.5 pb-1 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                  <QuickChip
                    active={!hasActiveFilters}
                    onClick={clearFilters}
                    label="Todos"
                  />
                  <QuickChip
                    active={prontaEntregaOnly}
                    onClick={() => applyQuickPreset({ prontaEntrega: true })}
                    label="Pronta entrega"
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
                    label={`Elétricos (${facets.totalEletricos})`}
                  />
                  <QuickChip
                    active={combustivel === 'Híbrido'}
                    onClick={() => applyQuickPreset({ combustivel: 'Híbrido' })}
                    label="Híbridos"
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
            )}

            {/* Desktop Inline Filter Grid (including Fuel & Dynamic Max Price & Tooltip on Sort) */}
            <div className="mt-4 hidden grid-cols-7 gap-2.5 border-t border-slate-100 pt-4 lg:grid">
              <FilterSelect
                label="Loja"
                value={loja}
                onChange={(v) => {
                  setLoja(v);
                  setVisibleCount(18);
                }}
                options={[
                  { value: 'todas', label: 'Todas as 4 lojas' },
                  ...lojas.map((l) => ({ value: l.slug, label: l.nome })),
                ]}
              />

              <FilterSelect
                label="Marca"
                value={marca}
                onChange={(v) => {
                  setMarca(v);
                  setVisibleCount(18);
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
                value={activeTab === 'motos' ? 'todas' : categoria}
                disabled={activeTab === 'motos'}
                onChange={(v) => {
                  setCategoria(v);
                  setVisibleCount(18);
                }}
                options={[
                  { value: 'todas', label: 'Todas as categorias' },
                  ...facets.categorias.map((c) => ({
                    value: c.nome,
                    label: `${c.nome} (${c.quantidade})`,
                  })),
                ]}
              />

              <FilterSelect
                label="Combustível"
                value={combustivel}
                onChange={(v) => {
                  setCombustivel(v);
                  setVisibleCount(18);
                }}
                options={[
                  { value: 'todos', label: 'Todos combustíveis' },
                  ...facets.combustiveis.map((c) => ({
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
                  setVisibleCount(18);
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
                  setVisibleCount(18);
                }}
                options={priceRanges.map((r) => ({
                  value: r.max ? String(r.max) : 'todos',
                  label: r.label,
                }))}
              />

              <div>
                <div className="mb-1.5 flex items-center gap-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Ordenar por
                  </label>
                  <TooltipHint content="Destaques do feirão: mostra primeiro os carros com selo Pronta entrega e depois ordena pelo menor preço.">
                    <button
                      type="button"
                      aria-label="Entender critério de ordenação Destaques do feirão"
                      className="text-slate-400 hover:text-[#0B3C4E] cursor-help"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipHint>
                </div>
                <select
                  value={ordenar || 'destaque'}
                  onChange={(e) =>
                    setOrdenar(e.target.value as FiltroVeiculos['ordenar'])
                  }
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-800 transition focus:border-[#0B3C4E] focus:bg-white focus:outline-none"
                >
                  <option value="destaque">Destaques do feirão</option>
                  <option value="preco_asc">Menor preço</option>
                  <option value="preco_desc">Maior preço</option>
                  <option value="ano_desc">Mais novos</option>
                  <option value="km_asc">Menor km</option>
                </select>
              </div>
            </div>

            {/* Active removable filter chips + count without fixed total */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#0B3C4E]" />
                <span>
                  Mostrando{' '}
                  <strong className="text-slate-950">
                    {visibleVehicles.length}
                  </strong>{' '}
                  {visibleVehicles.length === 1
                    ? itemTermSingular
                    : itemTermPlural}
                </span>
              </div>

              {hasActiveFilters && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {activeFilterChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={chip.onRemove}
                      className="inline-flex items-center gap-1 rounded-full bg-[#062835] px-2.5 py-1 text-xs font-bold text-white transition hover:bg-[#0B3C4E] cursor-pointer"
                    >
                      <span>{chip.label}</span>
                      <X className="h-3 w-3 text-orange-300" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="px-2 py-1 text-xs font-bold text-orange-600 hover:underline cursor-pointer"
                  >
                    Limpar tudo
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Empty State */}
          {filtered.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-slate-200 bg-white px-5 py-12 text-center shadow-sm sm:px-6">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Car className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-lg font-extrabold text-slate-900">
                Nenhum resultado para esses filtros
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                {prontaEntregaOnly
                  ? 'Nenhum carro está marcado com o selo Pronta entrega no momento. Limpe o filtro para ver todo o estoque das 4 lojas.'
                  : 'Tente remover algum filtro ou fale com nossa equipe pelo WhatsApp para consultar opções.'}
              </p>
              <div className="mt-6 flex flex-col items-stretch justify-center gap-2.5 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-[46px] rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 cursor-pointer"
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Vehicles Grid */}
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
                {visibleVehicles.map((v) => (
                  <VehicleCard
                    key={v.id}
                    veiculo={v}
                    campaignMode={campaignState.mode}
                    onOpenDetails={() => setSelectedVehicle(v)}
                    onWhatsappClick={() => handleCarWhatsapp(v)}
                  />
                ))}
              </div>

              {/* Pagination: ONLY "Carregar mais" (no "Mostrar todos (N)", no fixed total) */}
              {visibleCount < filtered.length && (
                <div className="mt-9 flex flex-col items-center gap-3">
                  <p className="text-xs font-semibold text-slate-500 sm:text-sm">
                    Mostrando <strong>{visibleVehicles.length}</strong>{' '}
                    {itemTermPlural}
                  </p>
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + 18)}
                    className="min-h-[48px] w-full max-w-xs rounded-xl bg-[#062835] px-7 py-3.5 text-sm font-extrabold uppercase tracking-wide text-white shadow-md transition hover:bg-[#0B3C4E] active:scale-[0.98] cursor-pointer"
                  >
                    Carregar mais
                  </button>
                </div>
              )}
            </>
          )}
        </main>

        {/* 7) BLOCO "SEU USADO VALE MAIS" */}
        {!isClosed && <TradeInSection />}

        {/* 8) LOCAL PRESENCIAL + CARDS DAS 4 LOJAS */}
        <section
          id="lojas"
          className="scroll-mt-20 border-t border-slate-200 bg-white py-10 sm:py-14"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            {/* Endereço Único do Feirão Presencial */}
            <div className="rounded-3xl border border-[#0B3C4E]/15 bg-gradient-to-r from-[#062835] to-[#0B3C4E] p-6 text-white shadow-lg sm:p-8">
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                <div className="max-w-2xl">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-orange-400">
                    Feirão Presencial • Endereço Único
                  </p>
                  <h2 className="mt-1 text-2xl font-black italic tracking-tight text-white sm:text-3xl">
                    As 4 lojas reunidas em um só lugar
                  </h2>
                  <div className="mt-3.5 space-y-2 text-sm text-slate-100">
                    <p className="flex items-start gap-2.5 font-bold">
                      <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
                      <span>
                        {FEIRAO_CONFIG.localPrincipal.endereco} (
                        {FEIRAO_CONFIG.localPrincipal.referencia})
                      </span>
                    </p>
                    <p className="flex items-start gap-2.5 text-xs text-slate-300 sm:text-sm">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                      <span>
                        {FEIRAO_CONFIG.horarioFeirao.startsWith('TODO:')
                          ? 'Horário especial do feirão (14 a 23/12): consulte pelo WhatsApp'
                          : FEIRAO_CONFIG.horarioFeirao}
                      </span>
                    </p>
                  </div>
                </div>

                <a
                  href={FEIRAO_CONFIG.localPrincipal.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[50px] shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 text-sm font-extrabold uppercase tracking-wide text-white shadow-lg shadow-orange-600/30 transition hover:bg-orange-600 active:scale-[0.98]"
                >
                  <Navigation className="h-4 w-4" />
                  Como chegar no feirão
                </a>
              </div>
            </div>

            {/* Cards das 4 Lojas Participantes (sem endereços individuais e sem telefones) */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {lojas.map((l) => {
                const count = metadata.porLoja[l.slug] || 0;
                return (
                  <div
                    key={l.slug}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-xs transition hover:border-slate-300 hover:shadow-md"
                  >
                    <div>
                      <div
                        className={`flex h-14 w-full items-center justify-center rounded-xl px-4 py-2 ${
                          l.logoTheme === 'light'
                            ? 'bg-white ring-1 ring-slate-200'
                            : 'bg-[#062835]'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={l.logo}
                          alt={`Logo ${l.nome}`}
                          loading="lazy"
                          className="max-h-9 max-w-[140px] object-contain"
                        />
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-2">
                        <h3 className="text-base font-extrabold text-slate-950">
                          {l.nome}
                        </h3>
                        <span className="shrink-0 rounded-full bg-[#062835]/10 px-2.5 py-0.5 text-xs font-extrabold text-[#062835]">
                          {count} {count === 1 ? 'carro' : 'carros'}
                        </span>
                      </div>

                      <p className="mt-2 text-xs text-slate-600">
                        Presente no pátio do ACELERA V3 de 14 a 23/12.
                      </p>
                    </div>

                    <div className="mt-5 pt-2">
                      <button
                        type="button"
                        onClick={() => handleStoreWhatsapp(l)}
                        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-orange-600 active:scale-[0.98] cursor-pointer"
                      >
                        <WhatsappIcon className="h-4 w-4 shrink-0" />
                        Falar no WhatsApp
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 9) RODAPÉ (legal, endereço único do feirão e links — SEM telefones e SEM link de API/Chatbot) */}
        <footer className="border-t border-white/10 bg-[#051F29] pb-24 text-slate-300 md:pb-10">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
            <div className="grid grid-cols-1 gap-8 border-b border-white/10 pb-8 md:grid-cols-12">
              <div className="md:col-span-5">
                <span className="text-xl font-black italic tracking-tight text-white">
                  ACELERA <span className="text-orange-400">V3</span>
                </span>
                <p className="mt-2 text-xs leading-relaxed text-slate-300 sm:text-sm">
                  {CAMPAIGN_COPY.selo} — 14 a 23 de dezembro de 2026 em Rio do
                  Sul/SC. Manos Veículos, Neném Autos, Rosa Automóveis e V3
                  Automóveis.
                </p>
              </div>

              <div className="md:col-span-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-orange-400">
                  Local do Feirão Presencial
                </h3>
                <div className="mt-3 space-y-2 text-xs text-slate-300">
                  <p className="flex items-start gap-2">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
                    <span>
                      <strong className="text-white">
                        {FEIRAO_CONFIG.localPrincipal.referencia}
                      </strong>
                      <br />
                      {FEIRAO_CONFIG.localPrincipal.endereco}
                    </span>
                  </p>
                  <a
                    href={FEIRAO_CONFIG.localPrincipal.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-bold text-orange-300 underline-offset-4 hover:text-orange-200 hover:underline"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    Abrir rota no Google Maps
                  </a>
                </div>
              </div>

              <div className="md:col-span-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-orange-400">
                  Navegação
                </h3>
                <ul className="mt-3 space-y-2 text-xs font-semibold text-slate-300">
                  <li>
                    <a href="#estoque" className="hover:text-white">
                      Ver carros
                    </a>
                  </li>
                  {!isClosed && (
                    <>
                      <li>
                        <a href="#simulador" className="hover:text-white">
                          Simular financiamento
                        </a>
                      </li>
                      <li>
                        <a href="#troca" className="hover:text-white">
                          Avaliar meu usado
                        </a>
                      </li>
                    </>
                  )}
                  <li>
                    <a href="#lojas" className="hover:text-white">
                      As 4 lojas
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 space-y-2 text-[11px] leading-relaxed text-slate-400">
              <p>{CAMPAIGN_COPY.legal}</p>
              <p>
                © 2026 ACELERA V3 — Rio do Sul/SC. Todos os direitos reservados.
              </p>
            </div>
          </div>
        </footer>

        {/* Mobile Fixed Bottom Bar (Filter + WhatsApp Floating CTA) */}
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 px-3.5 pt-2.5 shadow-[0_-8px_24px_rgba(6,40,53,0.14)] backdrop-blur-md md:hidden">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileFilterOpen(true)}
              className="relative inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-4 text-xs font-extrabold text-slate-900 active:scale-95 cursor-pointer"
            >
              <Filter className="h-4 w-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-extrabold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleGeneralWhatsapp('flutuante')}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-extrabold text-white shadow-lg shadow-orange-600/30 active:scale-[0.98] cursor-pointer"
            >
              <WhatsappIcon className="h-5 w-5 shrink-0" />
              Falar no WhatsApp
            </button>
          </div>
        </div>

        {/* Mobile Bottom Sheet Filter Drawer (Vaul) */}
        <Drawer.Root
          open={mobileFilterOpen}
          onOpenChange={setMobileFilterOpen}
        >
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs lg:hidden" />
            <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl focus:outline-none lg:hidden">
              <div className="shrink-0 border-b border-slate-200 px-5 pb-3.5 pt-2.5">
                <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
                <div className="flex items-center justify-between">
                  <div>
                    <Drawer.Title className="text-base font-extrabold text-slate-900">
                      Filtrar {itemTermPlural}
                    </Drawer.Title>
                    <p className="text-xs text-slate-500">
                      Arraste para baixo para fechar
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileFilterOpen(false)}
                    aria-label="Fechar filtros"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 active:scale-95 cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="thin-scrollbar flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
                <FilterSelect
                  mobile
                  label="Loja"
                  value={loja}
                  onChange={(v) => {
                    setLoja(v);
                    setVisibleCount(18);
                  }}
                  options={[
                    { value: 'todas', label: 'Todas as 4 lojas' },
                    ...lojas.map((l) => ({ value: l.slug, label: l.nome })),
                  ]}
                />

                <FilterSelect
                  mobile
                  label="Marca"
                  value={marca}
                  onChange={(v) => {
                    setMarca(v);
                    setVisibleCount(18);
                  }}
                  options={[
                    { value: 'todas', label: 'Todas as marcas' },
                    ...facets.marcas.map((m) => ({
                      value: m.nome,
                      label: `${m.nome} (${m.quantidade})`,
                    })),
                  ]}
                />

                {activeTab === 'carros' && (
                  <FilterSelect
                    mobile
                    label="Categoria"
                    value={categoria}
                    onChange={(v) => {
                      setCategoria(v);
                      setVisibleCount(18);
                    }}
                    options={[
                      { value: 'todas', label: 'Todas as categorias' },
                      ...facets.categorias.map((c) => ({
                        value: c.nome,
                        label: `${c.nome} (${c.quantidade})`,
                      })),
                    ]}
                  />
                )}

                <div className="grid grid-cols-2 gap-3">
                  <FilterSelect
                    mobile
                    label="Combustível"
                    value={combustivel}
                    onChange={(v) => {
                      setCombustivel(v);
                      setVisibleCount(18);
                    }}
                    options={[
                      { value: 'todos', label: 'Todos' },
                      ...facets.combustiveis.map((c) => ({
                        value: c.nome,
                        label: `${c.nome} (${c.quantidade})`,
                      })),
                    ]}
                  />

                  <FilterSelect
                    mobile
                    label="Câmbio"
                    value={cambio}
                    onChange={(v) => {
                      setCambio(v);
                      setVisibleCount(18);
                    }}
                    options={[
                      { value: 'todos', label: 'Todos' },
                      ...facets.cambios.map((c) => ({
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
                    setVisibleCount(18);
                  }}
                  options={priceRanges.map((r) => ({
                    value: r.max ? String(r.max) : 'todos',
                    label: r.label,
                  }))}
                />

                <label className="flex min-h-[48px] items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 cursor-pointer">
                  <span className="text-sm font-bold text-slate-800">
                    Apenas Pronta entrega
                  </span>
                  <input
                    type="checkbox"
                    checked={prontaEntregaOnly}
                    onChange={(e) => {
                      setProntaEntregaOnly(e.target.checked);
                      setVisibleCount(18);
                    }}
                    className="h-5 w-5 accent-orange-500"
                  />
                </label>
              </div>

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
                    setMobileFilterOpen(false);
                    document
                      .getElementById('estoque')
                      ?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="h-12 flex-1 rounded-xl bg-[#062835] px-5 text-sm font-extrabold text-white shadow-lg active:scale-[0.98] cursor-pointer"
                >
                  Aplicar filtros
                </button>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>

        {/* Vehicle Quick Sheet + Embla Carousel + Lightbox Modal */}
        <VehicleModal
          veiculo={selectedVehicle}
          campaignMode={campaignState.mode}
          onClose={() => setSelectedVehicle(null)}
        />
      </div>
    </TooltipProviderRoot>
  );
}

function VehicleCard({
  veiculo,
  campaignMode,
  onOpenDetails,
  onWhatsappClick,
}: {
  veiculo: Veiculo;
  campaignMode: CampaignMode;
  onOpenDetails: () => void;
  onWhatsappClick: () => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const showOfferBadge = campaignMode !== 'encerrado' && Boolean(veiculo.pronta_entrega);
  const kmLabel = formatKmDisplay(veiculo.km, veiculo.kmFormatado);
  const photoCount = veiculo.fotos.length;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-xl">
      {/* Photo container with lazy loading & skeleton */}
      <div
        onClick={onOpenDetails}
        className="relative aspect-[16/10] w-full cursor-pointer overflow-hidden bg-slate-200"
      >
        {veiculo.fotoCapa ? (
          <>
            {!imgLoaded && (
              <div
                aria-hidden="true"
                className="absolute inset-0 animate-pulse bg-slate-200"
              />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={veiculo.fotoCapa}
              alt={`${veiculo.titulo} ${veiculo.anoTexto} — ${veiculo.lojaNome}`}
              loading="lazy"
              decoding="async"
              onLoad={() => setImgLoaded(true)}
              className={`h-full w-full object-cover transition duration-500 group-hover:scale-105 ${
                imgLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-slate-900 text-slate-400">
            <Car className="h-10 w-10 opacity-40" />
            <span className="text-xs font-medium">Fotos sob consulta</span>
          </div>
        )}

        {/* Top badges: Store name visible + Pronta entrega (ONLY when marked & not closed) */}
        <div className="absolute left-2.5 right-2.5 top-2.5 flex items-start justify-between gap-2 sm:left-3 sm:right-3 sm:top-3">
          <span className="inline-flex max-w-[65%] items-center gap-1 truncate rounded-lg bg-[#062835]/90 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
            <Store className="h-3 w-3 shrink-0 text-orange-400" />
            <span className="truncate">{veiculo.lojaNome}</span>
          </span>
          {showOfferBadge && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-sm">
              <Zap className="h-3 w-3" />
              Pronta entrega
            </span>
          )}
        </div>

        {/* Bottom badges: Category + labeled photo counter ("12 fotos") */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 sm:left-3 sm:right-3">
          <span className="rounded-md bg-black/65 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            {veiculo.categoria}
          </span>

          {photoCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
              <Camera className="h-3 w-3 text-orange-300" />
              <span>
                {photoCount} {photoCount === 1 ? 'foto' : 'fotos'}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B3C4E]">
              {veiculo.marca}
            </p>
            <span className="text-[11px] font-bold text-slate-400">
              {veiculo.lojaNome}
            </span>
          </div>

          {/* Standardized Title with single-line/2-line ellipsis + accessible Radix Tooltip */}
          <TooltipHint content={veiculo.titulo}>
            <h3
              onClick={onOpenDetails}
              className="mt-1 truncate cursor-pointer text-base font-extrabold leading-snug text-slate-950 transition group-hover:text-orange-600"
            >
              {veiculo.titulo}
            </h3>
          </TooltipHint>

          <p className="mt-0.5 min-h-[1rem] truncate text-xs font-medium text-slate-500">
            {veiculo.versao || veiculo.modelo}
          </p>

          {/* Price */}
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-black tracking-tight text-slate-950">
              {veiculo.precoFormatado}
            </span>
            <span className="text-[11px] font-bold text-slate-400">
              {veiculo.codigo}
            </span>
          </div>

          {/* 4 Specs (Km sob consulta never breaks layout) */}
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-700">
            <div className="flex min-w-0 items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-[#0B3C4E]" />
              <span className="truncate font-semibold">{veiculo.anoTexto}</span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5 shrink-0 text-[#0B3C4E]" />
              <span className="truncate font-semibold" title={kmLabel}>
                {kmLabel}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <Cog className="h-3.5 w-3.5 shrink-0 text-[#0B3C4E]" />
              <span className="truncate font-semibold">{veiculo.cambio}</span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <Fuel className="h-3.5 w-3.5 shrink-0 text-[#0B3C4E]" />
              <span className="truncate font-semibold">{veiculo.combustivel}</span>
            </div>
          </div>
        </div>

        {/* Actions: WhatsApp CTA + "Ver fotos e ficha" */}
        <div className="mt-4 flex flex-col gap-2 pt-1.5">
          <button
            type="button"
            onClick={onWhatsappClick}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-extrabold text-white shadow-md shadow-orange-500/20 transition hover:bg-orange-600 active:scale-[0.98] cursor-pointer"
          >
            <WhatsappIcon className="h-4 w-4 shrink-0" />
            Chamar no WhatsApp
          </button>
          <button
            type="button"
            onClick={onOpenDetails}
            className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-[#062835] transition hover:border-[#0B3C4E] hover:bg-slate-100 active:scale-[0.98] cursor-pointer"
          >
            Ver fotos e ficha
          </button>
        </div>
      </div>
    </article>
  );
}

function BenefitCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-xs ring-1 ring-slate-200">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-black italic text-slate-950">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          {description}
        </p>
      </div>
    </div>
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
          ? 'bg-orange-500 text-white shadow-xs'
          : 'border border-slate-200 bg-slate-100 text-slate-700 hover:border-slate-300 hover:bg-slate-200/70'
      }`}
    >
      {label}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  mobile = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  mobile?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-semibold text-slate-800 transition focus:border-[#0B3C4E] focus:bg-white focus:outline-none disabled:opacity-50 ${
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
