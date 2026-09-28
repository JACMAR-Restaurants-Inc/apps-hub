/** A real calendar date 'YYYY-MM-DD' from a query string, or null. */
export function dateParam(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  const at = new Date(Date.UTC(y!, m! - 1, d!));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m! - 1 && at.getUTCDate() === d ? v : null;
}
