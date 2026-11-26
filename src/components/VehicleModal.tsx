'use client';

import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { Drawer } from 'vaul';
import {
  Calendar,
  Camera,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Cog,
  Fuel,
  Gauge,
  Maximize2,
  Palette,
  Store,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  buildRefCarro,
  buildVehicleWhatsappMessage,
  getSiglaFromCodigo,
} from '@/lib/config';
import { formatKmDisplay } from '@/lib/filters';
import { finalizarVisaoVeiculo, iniciarVisaoVeiculo, registrarInteracaoVeiculo } from '@/lib/acessos/cliente';
import { trackViewContent, triggerWhatsappLead } from '@/lib/tracking';
import type { CampaignMode, Veiculo } from '@/lib/types';
import { WhatsappIcon } from './WhatsappIcon';

interface VehicleModalProps {
  veiculo: Veiculo | null;
  campaignMode: CampaignMode;
  onClose: () => void;
}

export function VehicleModal({
  veiculo,
  campaignMode,
  onClose,
}: VehicleModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: 'start',
  });

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (veiculo) {
      setSelectedIndex(0);
      setLightboxOpen(false);
      emblaApi?.scrollTo(0, true);
      trackViewContent(veiculo);
    }
  }, [veiculo, emblaApi]);

  // Telemetria de acessos: tempo ativo na ficha, fotos vistas e galeria aberta
  useEffect(() => {
    if (!veiculo) return;
    iniciarVisaoVeiculo({ codigo: veiculo.codigo, titulo: veiculo.titulo, preco: veiculo.preco });
    return () => finalizarVisaoVeiculo();
  }, [veiculo]);

  useEffect(() => {
    if (veiculo) registrarInteracaoVeiculo('foto', selectedIndex);
  }, [veiculo, selectedIndex]);

  useEffect(() => {
    if (lightboxOpen) registrarInteracaoVeiculo('galeria');
  }, [lightboxOpen]);

  const fotos = veiculo?.fotos?.length ? veiculo.fotos : [];

  const scrollPrev = () => emblaApi?.scrollPrev();
  const scrollNext = () => emblaApi?.scrollNext();
  const scrollTo = (idx: number) => emblaApi?.scrollTo(idx);

  const handleWhatsappClick = () => {
    if (!veiculo) return;
    const ref = buildRefCarro(veiculo.codigo);
    const sigla = getSiglaFromCodigo(veiculo.codigo);
    const message = buildVehicleWhatsappMessage(veiculo);
    toast.success('Abrindo WhatsApp com os dados deste carro...');
    triggerWhatsappLead({
      message,
      tipo: 'carro',
      ref,
      loja_sigla: sigla,
      origem: 'card',
      veiculo: {
        codigo: veiculo.codigo,
        modelo: veiculo.titulo,
        ano: veiculo.anoTexto,
        preco: veiculo.precoFormatado,
      },
    });
  };

  const showOfferBadges = campaignMode !== 'encerrado';

  return (
    <>
      <Drawer.Root
        open={Boolean(veiculo)}
        onOpenChange={(open) => {
          if (!open && !lightboxOpen) onClose();
        }}
        dismissible={!lightboxOpen}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs" />
          <Drawer.Content
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[95dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl focus:outline-none sm:bottom-auto sm:top-1/2 sm:max-h-[92vh] sm:-translate-y-1/2 sm:rounded-2xl"
          >
            {veiculo && (
              <>
                {/* Drag handle (mobile) + Top bar */}
                <div className="shrink-0 bg-[#062835] text-white">
                  <div className="flex justify-center pt-2 sm:hidden">
                    <div className="h-1.5 w-12 rounded-full bg-white/30" />
                  </div>
                  <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="shrink-0 rounded-md bg-orange-500/20 px-2.5 py-1 text-xs font-extrabold tracking-wide text-orange-300 ring-1 ring-orange-400/30">
                        {veiculo.codigo}
                      </span>
                      <Drawer.Title className="truncate text-xs font-bold text-slate-100 sm:text-sm">
                        {veiculo.lojaNome} • {veiculo.cidade}
                      </Drawer.Title>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Fechar ficha do carro"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-95 cursor-pointer"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Scrollable body */}
                <div className="thin-scrollbar flex-1 overflow-y-auto overscroll-contain">
                  <div className="grid grid-cols-1 lg:grid-cols-12">
                    {/* Embla Carousel Gallery */}
                    <div
                      data-vaul-no-drag=""
                      className="bg-slate-900 lg:col-span-7"
                    >
                      <div className="relative aspect-[16/11] w-full overflow-hidden bg-slate-950">
                        {fotos.length > 0 ? (
                          <div ref={emblaRef} className="h-full w-full overflow-hidden">
                            <div className="flex h-full">
                              {fotos.map((url, idx) => (
                                <div
                                  key={url}
                                  className="relative h-full min-w-0 flex-[0_0_100%]"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={url}
                                    alt={`${veiculo.titulo} — foto ${idx + 1} de ${fotos.length}`}
                                    loading={idx === 0 ? 'eager' : 'lazy'}
                                    onClick={() => setLightboxOpen(true)}
                                    className="h-full w-full cursor-zoom-in object-cover"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                            <Car className="h-14 w-14 opacity-40" />
                            <span className="text-sm">Fotos disponíveis pelo WhatsApp</span>
                          </div>
                        )}

                        {fotos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setLightboxOpen(true)}
                            aria-label="Ampliar fotos em tela cheia com zoom"
                            className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm transition hover:bg-black/85 cursor-pointer"
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                            Zoom
                          </button>
                        )}

                        {fotos.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={scrollPrev}
                              aria-label="Foto anterior"
                              className="absolute left-2.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80 active:scale-95 cursor-pointer sm:left-3"
                            >
                              <ChevronLeft className="h-6 w-6" />
                            </button>
                            <button
                              type="button"
                              onClick={scrollNext}
                              aria-label="Próxima foto"
                              className="absolute right-2.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80 active:scale-95 cursor-pointer sm:right-3"
                            >
                              <ChevronRight className="h-6 w-6" />
                            </button>
                            <div className="absolute bottom-3 left-3 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-medium text-white/90 backdrop-blur-sm sm:hidden">
                              Deslize ou toque para zoom
                            </div>
                            <div className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
                              <Camera className="h-3.5 w-3.5" />
                              {selectedIndex + 1} / {fotos.length} fotos
                            </div>
                          </>
                        )}
                      </div>

                      {/* Thumbnails */}
                      {fotos.length > 1 && (
                        <div className="thin-scrollbar flex gap-2 overflow-x-auto bg-slate-950/95 p-2.5 sm:p-3">
                          {fotos.map((url, idx) => (
                            <button
                              key={url}
                              type="button"
                              onClick={() => scrollTo(idx)}
                              aria-label={`Ver foto ${idx + 1}`}
                              className={`relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition cursor-pointer sm:h-14 sm:w-20 ${
                                idx === selectedIndex
                                  ? 'border-orange-500 ring-2 ring-orange-500/40'
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

                    {/* Key info & conversion column */}
                    <div className="flex flex-col justify-between p-4 sm:p-6 lg:col-span-5">
                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                            {veiculo.marca}
                          </span>
                          <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-[#0B3C4E]">
                            {veiculo.categoria}
                          </span>
                          {showOfferBadges && veiculo.pronta_entrega && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-extrabold text-orange-800">
                              <Zap className="h-3 w-3" />
                              Pronta entrega
                            </span>
                          )}
                        </div>

                        <h2 className="text-lg font-black italic leading-tight text-slate-900 sm:text-2xl">
                          {veiculo.titulo}
                        </h2>
                        {veiculo.versao && (
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Versão: {veiculo.versao}
                          </p>
                        )}

                        <div className="mt-3.5 rounded-xl border border-[#0B3C4E]/15 bg-[#062835]/5 p-3.5 sm:mt-4 sm:p-4">
                          {showOfferBadges && (
                            <p className="text-[11px] font-extrabold uppercase tracking-wider text-orange-600">
                              ACELERA V3 • Financiando, 1ª parcela depois do Carnaval
                            </p>
                          )}
                          <p className="mt-0.5 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                            {veiculo.precoFormatado}
                          </p>
                          {showOfferBadges && (
                            <p className="mt-1 text-xs text-slate-600">
                              Taxas especiais C6 Bank e Viacredi Alto Vale, sujeitas à análise de crédito.
                            </p>
                          )}
                        </div>

                        {/* Specs Grid */}
                        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-2.5">
                          <SpecPill icon={<Calendar className="h-4 w-4" />} label="Ano" value={veiculo.anoTexto} />
                          <SpecPill
                            icon={<Gauge className="h-4 w-4" />}
                            label="Quilometragem"
                            value={formatKmDisplay(veiculo.km, veiculo.kmFormatado)}
                          />
                          <SpecPill icon={<Cog className="h-4 w-4" />} label="Câmbio" value={veiculo.cambio} />
                          <SpecPill icon={<Fuel className="h-4 w-4" />} label="Combustível" value={veiculo.combustivel} />
                          <SpecPill icon={<Palette className="h-4 w-4" />} label="Cor" value={veiculo.cor} />
                          <SpecPill icon={<Store className="h-4 w-4" />} label="Loja" value={veiculo.lojaNome} />
                        </div>
                      </div>

                      {/* Desktop WhatsApp CTA */}
                      <div className="mt-5 hidden border-t border-slate-100 pt-4 sm:block">
                        <button
                          type="button"
                          onClick={handleWhatsappClick}
                          className="flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-xl bg-orange-500 px-5 py-3.5 text-base font-extrabold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600 active:scale-[0.98] cursor-pointer"
                        >
                          <WhatsappIcon className="h-5 w-5" />
                          Chamar no WhatsApp
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Description & Optionals */}
                  <div className="border-t border-slate-200 bg-slate-50 p-4 pb-8 sm:p-6">
                    {veiculo.descricao && (
                      <div className="mb-5 sm:mb-6">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 sm:text-sm">
                          Sobre este carro
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
                              <Check className="h-3.5 w-3.5 shrink-0 text-[#0B3C4E]" />
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

                {/* Sticky Mobile Bottom WhatsApp Bar inside Drawer */}
                <div className="safe-bottom shrink-0 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur-md sm:hidden">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 shrink-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {veiculo.lojaNome}
                      </p>
                      <p className="text-base font-black leading-tight text-slate-950">
                        {veiculo.precoFormatado}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleWhatsappClick}
                      className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-orange-500/25 active:scale-[0.98] cursor-pointer"
                    >
                      <WhatsappIcon className="h-5 w-5 shrink-0" />
                      Chamar no WhatsApp
                    </button>
                  </div>
                </div>
              </>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Fullscreen Pinch-to-Zoom Lightbox */}
      {fotos.length > 0 && (
        <Lightbox
          open={lightboxOpen}
          close={() => setLightboxOpen(false)}
          index={selectedIndex}
          slides={fotos.map((src) => ({ src }))}
          plugins={[Zoom]}
          zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }}
          on={{
            view: ({ index }) => {
              setSelectedIndex(index);
              emblaApi?.scrollTo(index, true);
            },
          }}
        />
      )}
    </>
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
      <div className="shrink-0 text-[#0B3C4E]">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </p>
        <p className="truncate text-xs font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );
}
