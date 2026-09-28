import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanFileName } from './attachments';
import { fileStore, sniffType } from './files';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && existsSync('.env.local')) process.loadEnvFile('.env.local');

const bytes = (...xs: (number | string)[]) => new Uint8Array(xs.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x])));

describe('sniffType: what a file is, from its bytes', () => {
  it('knows the five allowed kinds', () => {
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffType(bytes(0x89, 'PNG', 13, 10))).toBe('image/png');
    expect(sniffType(bytes('GIF89a'))).toBe('image/gif');
    expect(sniffType(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe('image/webp');
    expect(sniffType(bytes('%PDF-1.7'))).toBe('application/pdf');
  });

  it('refuses anything else, whatever it is called', () => {
    expect(sniffType(bytes('<html><script>'))).toBeNull();
    expect(sniffType(bytes('<svg xmlns='))).toBeNull();
    expect(sniffType(bytes('MZ'))).toBeNull();
    expect(sniffType(new Uint8Array())).toBeNull();
  });
});

describe('cleanFileName', () => {
  it('keeps the name, drops any path and anything that could break a header', () => {
    expect(cleanFileName('C:\\Users\\x\\reçu 12.pdf')).toBe('reçu 12.pdf');
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
    expect(cleanFileName('a"b\r\nc.jpg')).toBe('abc.jpg');
    expect(cleanFileName('')).toBe('fichier');
    expect(cleanFileName('x'.repeat(300)).length).toBe(100);
  });
});

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)('the Supabase file store, for real', () => {
  it('saves, reads back and removes a file in the private bucket', async () => {
    const store = fileStore();
    const path = `test/${crypto.randomUUID()}.pdf`;
    const data = bytes('%PDF-1.7 test');
    const ref = await store.put(path, data, 'application/pdf');
    expect(ref).toBe(`supabase:${path}`);
    const back = await store.get(ref);
    expect(back?.contentType).toBe('application/pdf');
    expect([...back!.bytes]).toEqual([...data]);
    await store.remove(ref);
    expect(await store.get(ref)).toBeNull();
  });

  it('a ref from another store is simply not found here', async () => {
    expect(await fileStore().get('drive:abc')).toBeNull();
  });
});
