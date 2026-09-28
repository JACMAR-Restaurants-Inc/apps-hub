import { describe, expect, it } from 'vitest';
import { installPlatform, showInstallBanner, showInstallMenuItem } from './install';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1';
// iPadOS asks for the desktop site by default.
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
const MAC = IPAD;
const ANDROID =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

describe('installPlatform', () => {
  it('knows an iPhone, in Safari or Chrome', () => {
    expect(installPlatform({ ua: IPHONE, touchPoints: 5, standalone: false })).toBe('ios');
    expect(installPlatform({ ua: IPHONE_CHROME, touchPoints: 5, standalone: false })).toBe('ios');
  });

  it('knows an iPad calling itself a Mac, by its touch screen', () => {
    expect(installPlatform({ ua: IPAD, touchPoints: 5, standalone: false })).toBe('ios');
    expect(installPlatform({ ua: MAC, touchPoints: 0, standalone: false })).toBe('none');
  });

  it('knows Android, and offers nothing to a computer', () => {
    expect(installPlatform({ ua: ANDROID, touchPoints: 5, standalone: false })).toBe('android');
    expect(installPlatform({ ua: WINDOWS, touchPoints: 0, standalone: false })).toBe('none');
  });

  it('offers nothing once the portal was opened from its icon', () => {
    expect(installPlatform({ ua: IPHONE, touchPoints: 5, standalone: true })).toBe('none');
    expect(installPlatform({ ua: ANDROID, touchPoints: 5, standalone: true })).toBe('none');
  });
});

describe('the Home banner', () => {
  it('shows on an iPhone until dismissed', () => {
    expect(showInstallBanner({ platform: 'ios', canPrompt: false, dismissed: false })).toBe(true);
    expect(showInstallBanner({ platform: 'ios', canPrompt: false, dismissed: true })).toBe(false);
  });

  it('shows on Android only while the browser offers to install', () => {
    expect(showInstallBanner({ platform: 'android', canPrompt: true, dismissed: false })).toBe(true);
    expect(showInstallBanner({ platform: 'android', canPrompt: false, dismissed: false })).toBe(false);
    expect(showInstallBanner({ platform: 'android', canPrompt: true, dismissed: true })).toBe(false);
  });

  it('never shows on a computer, even if its browser could install', () => {
    expect(showInstallBanner({ platform: 'none', canPrompt: true, dismissed: false })).toBe(false);
  });
});

describe('the menu item', () => {
  it('stays for every phone after the banner is dismissed, and not elsewhere', () => {
    expect(showInstallMenuItem('ios')).toBe(true);
    expect(showInstallMenuItem('android')).toBe(true);
    expect(showInstallMenuItem('none')).toBe(false);
  });
});
