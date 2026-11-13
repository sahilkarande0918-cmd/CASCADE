import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const display = Bricolage_Grotesque({ variable: '--font-bricolage', subsets: ['latin'], display: 'swap' });
const mono = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'CASCADE: watch a city fail, then plan around it',
  description:
    'Click any piece of infrastructure, simulate its failure, and watch the consequences spread through the city over time. A browser-native, explainable cascade simulator built on open data.',
};

export const viewport: Viewport = { themeColor: '#1A0A22' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
