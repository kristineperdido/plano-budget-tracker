import type { MetadataRoute } from 'next';

/**
 * Makes Plano installable, so it opens from the home screen with no address
 * bar. `background_color` is the tarpaulin ink rather than the paper: it is
 * what the launch screen is painted with before anything renders, and starting
 * dark then arriving on paper reads as the app opening rather than as a flash.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Plano — shared budget',
    short_name: 'Plano',
    description: 'Shared living budget and daily food tracker.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#241e15',
    theme_color: '#241e15',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android crops a maskable icon to its own shape; the mark sits inside
      // the safe area so nothing important is cut.
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
