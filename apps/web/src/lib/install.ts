/**
 * Add to home screen: who is offered what (owner's call, 2026-09-28, reversing the
 * port's "no install button"). The manifest was already there; this makes it findable.
 *
 * - Android: the browser hands us its own install window (`beforeinstallprompt`), so
 *   the banner's button installs in one tap. The browser only offers it while the
 *   portal is NOT installed, which is also how we know to stay quiet once it is.
 * - iPhone and iPad: Apple gives a web page no way to install itself, from any
 *   browser. The best we can do is show the steps.
 * - A computer, or the portal already opened from its icon: nothing.
 *
 * Pure, so the rules are tested without a phone (`install.test.ts`).
 */

export type InstallPlatform = 'ios' | 'android' | 'none';

export function installPlatform(d: { ua: string; touchPoints: number; standalone: boolean }): InstallPlatform {
  if (d.standalone) return 'none';
  // iPadOS asks for desktop sites and calls itself a Mac; only the touch screen gives it away.
  if (/iPhone|iPad|iPod/.test(d.ua) || (/Macintosh/.test(d.ua) && d.touchPoints > 1)) return 'ios';
  if (/Android/.test(d.ua)) return 'android';
  return 'none';
}

/**
 * The Home banner, until someone installs or dismisses it.
 * On Android it waits for the browser's offer: without it the portal is either
 * installed already or the browser cannot install it, and a banner would nag either
 * way. The menu item stays for them, with the steps. On an iPhone nothing tells us
 * it was installed from Safari, so "C'est fait" in the steps dismisses it.
 */
export function showInstallBanner(s: { platform: InstallPlatform; canPrompt: boolean; dismissed: boolean }): boolean {
  if (s.dismissed) return false;
  if (s.platform === 'ios') return true;
  return s.platform === 'android' && s.canPrompt;
}

/** The avatar menu's "Ajouter à l'écran d'accueil": every phone not yet running from its icon. */
export const showInstallMenuItem = (platform: InstallPlatform): boolean => platform !== 'none';
