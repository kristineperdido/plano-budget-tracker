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

/** iOS needs a launch image per device; it will not generate one. */
const SPLASH: { w: number; h: number; r: number; name: string }[] = [
  { w: 375, h: 667, r: 2, name: 'iphone-se' },
  { w: 390, h: 844, r: 3, name: 'iphone-13' },
  { w: 393, h: 852, r: 3, name: 'iphone-15' },
  { w: 402, h: 874, r: 3, name: 'iphone-16' },
  { w: 428, h: 926, r: 3, name: 'iphone-14-plus' },
  { w: 430, h: 932, r: 3, name: 'iphone-15-pro-max' },
  { w: 440, h: 956, r: 3, name: 'iphone-16-pro-max' },
];

export const metadata: Metadata = {
  title: 'Plano',
  description: 'Shared living budget and daily food tracker.',
  applicationName: 'Plano',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  other: {
    // Next emits the modern `mobile-web-app-capable`; iOS before 16.4 only
    // honours the prefixed form, and without it those phones open in a browser
    // tab rather than standalone.
    'apple-mobile-web-app-capable': 'yes',
  },
  appleWebApp: {
    capable: true,
    title: 'Plano',
    // The status bar sits over the tarpaulin header, so its text must be light.
    statusBarStyle: 'black-translucent',
    startupImage: SPLASH.map(({ w, h, r, name }) => ({
      url: `/splash/${name}.png`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
    })),
  },
};

export const viewport: Viewport = {
  // The tarpaulin header is what sits under the status bar, so the browser
  // chrome should match the ink rather than the paper below it.
  themeColor: '#241e15',
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
