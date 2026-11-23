'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Cog,
  CreditCard,
  Fuel,
  Gauge,
  MapPin,
  Palette,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  buildVehicleWhatsappMessage,
  buildWhatsappUrl,
  LOJAS_BY_SLUG,
} from '@/lib/config';
import type { Veiculo } from '@/lib/types';
import { WhatsappIcon } from './WhatsappIcon';

interface VehicleModalProps {
  veiculo: Veiculo | null;
  onClose: () => void;
}

export function VehicleModal({ veiculo, onClose }: VehicleModalProps) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    setPhotoIdx(0);
  }, [veiculo?.id]);

  useEffect(() => {
    if (!veiculo) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && veiculo.fotos.length > 1) {
        setPhotoIdx((i) => (i + 1) % veiculo.fotos.length);
      }
      if (e.key === 'ArrowLeft' && veiculo.fotos.length > 1) {
        setPhotoIdx((i) => (i - 1 + veiculo.fotos.length) % veiculo.fotos.length);
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
    };
  }, [veiculo, onClose]);

  if (!veiculo) return null;

  const loja = LOJAS_BY_SLUG[veiculo.lojaSlug];
  const fotos = veiculo.fotos.length > 0 ? veiculo.fotos : [];
  const currentPhoto = fotos[photoIdx] || veiculo.fotoCapa;

  const nextPhoto = () => {
    if (fotos.length > 1) setPhotoIdx((i) => (i + 1) % fotos.length);
  };
  const prevPhoto = () => {
    if (fotos.length > 1)
      setPhotoIdx((i) => (i - 1 + fotos.length) % fotos.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    // Horizontal swipe only
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) nextPhoto();
      else prevPhoto();
    }
  };

  const waInfo = buildWhatsappUrl(buildVehicleWhatsappMessage(veiculo, 'info'));
  const waFinanc = buildWhatsappUrl(
    buildVehicleWhatsappMessage(veiculo, 'financiamento')
  );
  const waTroca = buildWhatsappUrl(buildVehicleWhatsappMessage(veiculo, 'troca'));
  const waVisita = buildWhatsappUrl(buildVehicleWhatsappMessage(veiculo, 'visita'));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={veiculo.titulo}
      onClick={onClose}
    >
      <div
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-950 px-4 py-3 text-white sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="shrink-0 rounded-md bg-white/10 px-2.5 py-1 text-xs font-bold tracking-wide text-amber-300">
              CÓD. {veiculo.codigo}
            </span>
            <span className="truncate text-xs font-semibold text-slate-200 sm:text-sm">
              {veiculo.lojaNome} • {veiculo.cidade}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-95 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="thin-scrollbar flex-1 overflow-y-auto overscroll-contain">
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Gallery column with swipe support */}
            <div className="bg-slate-900 lg:col-span-7">
              <div
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                className="relative aspect-[16/11] w-full select-none overflow-hidden bg-slate-950"
              >
                {currentPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentPhoto}
                    alt={`${veiculo.titulo} - Foto ${photoIdx + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                    <Car className="h-14 w-14 opacity-40" />
                    <span className="text-sm">Solicite as fotos pelo WhatsApp</span>
                  </div>
                )}

                {fotos.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={prevPhoto}
                      aria-label="Foto anterior"
                      className="absolute left-2.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80 active:scale-95 cursor-pointer sm:left-3"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button
                      type="button"
                      onClick={nextPhoto}
                      aria-label="Próxima foto"
                      className="absolute right-2.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80 active:scale-95 cursor-pointer sm:right-3"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>
                    <div className="absolute bottom-3 left-3 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-medium text-white/90 backdrop-blur-sm sm:hidden">
                      Deslize para ver mais fotos
                    </div>
                    <div className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                      {photoIdx + 1} / {fotos.length}
                    </div>
                  </>
                )}
              </div>

              {/* Thumbnails */}
              {fotos.length > 1 && (
                <div className="thin-scrollbar flex gap-2 overflow-x-auto bg-slate-950/90 p-2.5 sm:p-3">
                  {fotos.map((url, idx) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setPhotoIdx(idx)}
                      className={`relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition cursor-pointer sm:h-14 sm:w-20 ${
                        idx === photoIdx
                          ? 'border-emerald-400 ring-2 ring-emerald-400/40'
                          : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Miniatura ${idx + 1}`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Conversion & Key Info Column */}
            <div className="flex flex-col justify-between p-4 sm:p-6 lg:col-span-5">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                    {veiculo.marca}
                  </span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                    {veiculo.categoria}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                    Disponível no Feirão
                  </span>
                </div>

                <h2 className="text-lg font-extrabold leading-tight text-slate-900 sm:text-2xl">
                  {veiculo.titulo}
                </h2>

                <div className="mt-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 sm:mt-4 sm:p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                    Oferta Especial do Feirão
                  </p>
                  <p className="mt-0.5 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                    {veiculo.precoFormatado}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Financiamento facilitado • Aceitamos seu usado na troca
                  </p>
                </div>

                {/* Specs Grid */}
                <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-2.5">
                  <SpecPill icon={<Calendar className="h-4 w-4" />} label="Ano" value={veiculo.anoTexto} />
                  <SpecPill icon={<Gauge className="h-4 w-4" />} label="Quilometragem" value={veiculo.kmFormatado} />
                  <SpecPill icon={<Cog className="h-4 w-4" />} label="Câmbio" value={veiculo.cambio} />
                  <SpecPill icon={<Fuel className="h-4 w-4" />} label="Combustível" value={veiculo.combustivel} />
                  <SpecPill icon={<Palette className="h-4 w-4" />} label="Cor" value={veiculo.cor} />
                  <SpecPill
                    icon={<MapPin className="h-4 w-4" />}
                    label="Loja"
                    value={veiculo.lojaNome}
                  />
                </div>
              </div>

              {/* Quick Intent CTAs */}
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 sm:mt-5 sm:space-y-2.5">
                <a
                  href={waInfo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden w-full items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-5 py-3.5 text-base font-extrabold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-[#1ebe5d] active:scale-[0.99] sm:flex"
                >
                  <WhatsappIcon className="h-5 w-5" />
                  Tenho Interesse no WhatsApp
                </a>

                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={waFinanc}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2.5 text-center text-xs font-bold text-slate-800 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800 active:scale-[0.98]"
                  >
                    <CreditCard className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>Simular Financiamento</span>
                  </a>
                  <a
                    href={waTroca}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2.5 text-center text-xs font-bold text-slate-800 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800 active:scale-[0.98]"
                  >
                    <RefreshCw className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>Avaliar Meu Usado</span>
                  </a>
                </div>

                <a
                  href={waVisita}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                >
                  <ShieldCheck className="h-4 w-4 shrink-0 text-slate-500" />
                  Agendar Visita / Test Drive ({loja?.nome})
                </a>
              </div>
            </div>
          </div>

          {/* Description & Optionals */}
          <div className="border-t border-slate-200 bg-slate-50 p-4 pb-8 sm:p-6">
            {veiculo.descricao && (
              <div className="mb-5 sm:mb-6">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 sm:text-sm">
                  Sobre este veículo
                </h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                  {veiculo.descricao}
                </p>
              </div>
            )}

            {veiculo.opcionais.length > 0 && (
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 sm:text-sm">
                  Itens e Opcionais ({veiculo.opcionais.length})
                </h3>
                <ul className="mt-3 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                  {veiculo.opcionais.map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-2 text-xs font-medium text-slate-700 shadow-xs ring-1 ring-slate-200/70"
                    >
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span className="truncate" title={item}>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Mobile Bottom WhatsApp Bar inside Modal */}
        <div className="safe-bottom shrink-0 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur-md sm:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Oferta Feirão
              </p>
              <p className="text-base font-extrabold leading-tight text-slate-950">
                {veiculo.precoFormatado}
              </p>
            </div>
            <a
              href={waInfo}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-emerald-500/25 active:scale-[0.98]"
            >
              <WhatsappIcon className="h-5 w-5 shrink-0" />
              Chamar no WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpecPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2 ring-1 ring-slate-200/70 sm:gap-2.5 sm:px-3">
      <div className="shrink-0 text-slate-400">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </p>
        <p className="truncate text-xs font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );
}
