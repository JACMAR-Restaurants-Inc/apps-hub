import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { connection } from 'next/server';
import './globals.css';

// Inter 400-700 for the signed-in pages, as the Apps Script portal loaded it (§44).
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'JM Portal',
  description: 'Vos applications. Un seul endroit.',
  icons: {
    icon: [{ url: '/brand/jm-portal-mark.png', type: 'image/png' }],
    // Opaque and inset: iOS fills a transparent icon with black (designs/branding/BRAND.md).
    apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180' }],
  },
};

// No maximum-scale: iOS zoom is prevented by every field being 16px or more (§60),
// and a page that cannot be zoomed shuts out people who need to zoom it.
export const viewport: Viewport = { themeColor: '#0B2556' };

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // Every page renders per request, so each gets the nonce the proxy made for it: a page
  // built in advance (the 404 page was) would carry no nonce and its scripts would be
  // refused (lib/security-headers.ts).
  await connection();
  return (
    <html lang="fr" className={inter.variable}>
      <body className="shell">{children}</body>
    </html>
  );
}
