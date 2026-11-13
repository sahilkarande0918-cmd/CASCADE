import type { Metadata, Viewport } from 'next';
import { Stack_Sans_Headline, Stack_Sans_Text } from 'next/font/google';
import './globals.css';

const headline = Stack_Sans_Headline({ variable: '--font-headline', subsets: ['latin'], weight: ['300'], display: 'swap' });
const text = Stack_Sans_Text({ variable: '--font-text', subsets: ['latin'], weight: ['400', '500'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Cascade: watch a city fail, then plan around it',
  description:
    'Fail any piece of a city’s infrastructure and watch the consequences spread through power, water, roads and comms over 72 hours. A browser-native, explainable simulator built on open map data.',
};

export const viewport: Viewport = { themeColor: '#FFF4E8' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${headline.variable} ${text.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
