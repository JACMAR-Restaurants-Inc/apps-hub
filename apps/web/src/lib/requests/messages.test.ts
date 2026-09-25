import { describe, expect, it } from 'vitest';
import { accessGrantedMail, accessRequestMail, GRANT_PANEL_LABELS, type Mail } from './messages';

const request = (over: Partial<Parameters<typeof accessRequestMail>[0]> = {}) =>
  accessRequestMail({
    email: 'manager@gmail.com',
    appName: 'Cash Balancing',
    adminUrl: 'https://hub.test/admin/access',
    employee: { number: '0014', fullName: 'Jane Doe', active: true, storeLabel: '1647 - Hull' },
    storeTicked: true,
    askedAgain: false,
    ...over,
  });
const granted = () =>
  accessGrantedMail({ email: 'manager@gmail.com', appName: 'Cash Balancing', url: 'https://hub.test/cash', stores: ['1647 - Hull', '3472 - Aylmer'] });

const all = (): Mail[] => [request(), request({ employee: null, storeTicked: false, askedAgain: true }), request({ employee: { number: '1', fullName: 'X', active: false, storeLabel: null } }), granted()];
const visible = (m: Mail) => [m.subject, m.text, m.html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')];

describe('the access emails', () => {
  it('use no dash as punctuation; the only " - " is a store, written "1647 - Hull"', () => {
    for (const m of all()) {
      for (const s of visible(m)) {
        expect(s).not.toMatch(/[—–]/);
        const withoutStores = s.replace(/\b\d{3,6} - [^,\n.)]+/g, '');
        expect(withoutStores).not.toMatch(/\s-\s/);
      }
    }
  });

  it('are French: a non-breaking space before every colon, and no English left', () => {
    for (const m of all()) {
      for (const s of visible(m)) {
        const text = s.replace(/https?:\/\/\S+/g, '');
        expect(text).not.toMatch(/[^ ]:/);
        expect(text).not.toMatch(/\b(the|you|access to|has asked|please)\b/i);
      }
    }
  });

  it('tell the admin the labels the Grant panel really has', () => {
    expect(request().text).toContain(`« ${GRANT_PANEL_LABELS.review} »`);
    expect(request().text).toContain(`« ${GRANT_PANEL_LABELS.grant} »`);
  });

  it('say when Clearview has the person as inactive, and when they had access before', () => {
    expect(request({ employee: { number: '1', fullName: 'X', active: false, storeLabel: null } }).text).toContain('n’est PAS active');
    expect(request().text).not.toContain('PAS active');
    expect(request({ askedAgain: true }).text).toContain('avait déjà eu accès');
  });

  it('escape what a person typed or Google returned: an address cannot inject HTML', () => {
    const m = request({ email: 'x"><script>alert(1)</script>@gmail.com' });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
  });

  it('the grant email names the address to sign in with, the link and the stores', () => {
    const m = granted();
    expect(m.subject).toBe('Vous avez maintenant accès à Cash Balancing');
    expect(m.html).toContain('<strong>manager@gmail.com</strong>');
    expect(m.text).toContain('https://hub.test/cash');
    expect(m.text).toContain('1647 - Hull, 3472 - Aylmer');
  });
});
