'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Loop ambiente de fundo do hero (sem som). A imagem da campanha continua por baixo como capa:
 * o vídeo só entra (com fade) depois de carregar e nunca para quem pediu menos movimento ou economia de dados.
 */
export function HeroVideo() {
  const [permitido, setPermitido] = useState(false);
  const [pronto, setPronto] = useState(false);
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    setPermitido(!reduzir && !conn?.saveData);
  }, []);

  if (!permitido) return null;

  return (
    <video
      ref={ref}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
      tabIndex={-1}
      onCanPlay={() => setPronto(true)}
      className={`pointer-events-none absolute inset-0 h-full w-full object-cover object-[72%_center] transition-opacity duration-1000 sm:object-right ${
        pronto ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <source src="/hero/hero-m.mp4" type="video/mp4" media="(max-width: 767px)" />
      <source src="/hero/hero.webm" type="video/webm" />
      <source src="/hero/hero.mp4" type="video/mp4" />
    </video>
  );
}
