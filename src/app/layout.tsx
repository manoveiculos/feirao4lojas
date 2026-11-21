import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { FEIRAO_CONFIG } from '@/lib/config';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
});

export const metadata: Metadata = {
  title: `${FEIRAO_CONFIG.nome} | Carros Seminovos e 0km em ${FEIRAO_CONFIG.cidade}`,
  description:
    'Neném Autos, Rosa Automóveis, V3 Automóveis e Manos Veículos reunidas em um único feirão com condições imperdíveis. Veja o estoque completo e fale direto no WhatsApp!',
  openGraph: {
    title: `${FEIRAO_CONFIG.nome} — 4 Grandes Lojas em Um Só Lugar`,
    description:
      'Confira todos os veículos das 4 lojas participantes, filtre por modelo ou valor e garanta sua oferta direto pelo WhatsApp.',
    type: 'website',
    locale: 'pt_BR',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={plusJakarta.variable}>
      <body className="font-[family-name:var(--font-jakarta)] antialiased selection:bg-emerald-500/20 selection:text-emerald-950">
        {children}
      </body>
    </html>
  );
}
