import { describe, expect, it } from 'vitest';
import { dict } from './i18n';
import { LIMITS, allow } from './rate-limit';

describe('the rate limiter', () => {
  it('fails OPEN when the count cannot be read, and logs it', async () => {
    const logged: string[] = [];
    const broken = { insert: () => { throw new Error('db down'); } } as never;
    expect(await allow(broken, 'accessRequest', 'x@example.invalid', new Date(), (m) => void logged.push(m))).toEqual({ allowed: true, justTripped: false });
    expect(logged).toHaveLength(1);
  });

  it('the message a person sees names the real wait', () => {
    const minutes = String(LIMITS.accessRequest.windowSeconds / 60);
    expect(dict.rate_limited.fr).toContain(`${minutes} minutes`);
    expect(dict.rate_limited.en).toContain(`${minutes} minutes`);
  });
});
