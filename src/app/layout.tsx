import type { Metadata, Viewport } from 'next';
import { Anton, Caveat } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/AppShell';

// Self-hosted by next/font, so the shopfront lettering never round-trips to a
// CDN. Anton has one weight by design; Caveat is used at 600 throughout.
const anton = Anton({ subsets: ['latin'], weight: '400', variable: '--font-anton', display: 'swap' });
const caveat = Caveat({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-caveat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Plano',
  description: 'Shared living budget and daily food tracker.',
};

export const viewport: Viewport = {
  themeColor: '#f4ead1',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${caveat.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
