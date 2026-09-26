import type { MetadataRoute } from 'next';

// Add to home screen (§69). Standalone, with the portal's navy and page colours.
// Deliberately no service worker and no install button: the home-screen icon is the
// whole feature, and an offline copy of an access portal would show stale access.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'JM Portal',
    short_name: 'JM Portal',
    description: 'Vos applications. Un seul endroit.',
    lang: 'fr-CA',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F3F6FB',
    theme_color: '#0B2556',
    icons: [
      { src: '/brand/jm-portal-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/jm-portal-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/jm-portal-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
