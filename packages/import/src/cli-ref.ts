/** The Supabase project ref in a connection string: pooler user "postgres.<ref>", or host "db.<ref>.supabase.co". */
export function projectRef(databaseUrl: string): string | null {
  try {
    const u = new URL(databaseUrl);
    const fromUser = /^postgres\.([a-z0-9]+)$/.exec(decodeURIComponent(u.username))?.[1];
    const fromHost = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(u.hostname)?.[1];
    return fromUser ?? fromHost ?? null;
  } catch {
    return null;
  }
}
