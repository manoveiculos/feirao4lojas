import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from 'sonner';
import { TrackingScripts } from '@/components/TrackingScripts';
import { FEIRAO_CONFIG } from '@/lib/config';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-jakarta',
  adjustFontFallback: false,
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#062835',
};

const ogImageUrl = `${FEIRAO_CONFIG.siteUrl}${FEIRAO_CONFIG.ogImage}`;

export const metadata: Metadata = {
  metadataBase: new URL(FEIRAO_CONFIG.siteUrl),
  title: 'Acelera V3 | Feirão de carros em Rio do Sul, 14 a 23 de dezembro',
  description:
    'De 14 a 23 de dezembro em Rio do Sul/SC. Saia rodando na hora, com a 1ª parcela só depois do Carnaval. Taxas especiais C6 Bank e Viacredi Alto Vale. Manos Veículos, Neném Autos, Rosa Automóveis e V3 Automóveis.',
  openGraph: {
    title: 'Acelera V3 | Feirão de carros em Rio do Sul, 14 a 23 de dezembro',
    description:
      'Último feirão do ano na região. Saia rodando na hora, com a 1ª parcela só depois do Carnaval e taxas especiais C6 Bank e Viacredi Alto Vale.',
    type: 'website',
    locale: 'pt_BR',
    url: FEIRAO_CONFIG.siteUrl,
    images: [
      {
        url: ogImageUrl,
        width: 1600,
        height: 720,
        alt: 'Acelera V3 — Feirão de carros em Rio do Sul, 14 a 23 de dezembro',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Acelera V3 | Feirão de carros em Rio do Sul, 14 a 23 de dezembro',
    description:
      'Saia rodando na hora, com a 1ª parcela só depois do Carnaval. Taxas especiais C6 Bank e Viacredi Alto Vale.',
    images: [ogImageUrl],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={plusJakarta.variable}>
      <body className="font-[family-name:var(--font-jakarta)] antialiased selection:bg-orange-500/20 selection:text-slate-950">
        {children}
        <Toaster position="top-center" richColors closeButton />
        <TrackingScripts />
      </body>
    </html>
  );
}
