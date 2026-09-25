/**
 * npm run import -- <snapshot folder>                         read and check; writes nothing
 * npm run import -- <snapshot folder> --write --target <ref>  import, then verify
 * npm run import -- <snapshot folder> --verify --target <ref> verify only
 *
 * The folder holds the two .xlsx downloads: "Access Control - Data*.xlsx" and
 * "Cash Balancing*.xlsx" (a copy with Config_Managers deleted). Keep it OUTSIDE the
 * repo. <ref> is the Supabase project ref of DATABASE_URL, typed out so the import
 * cannot reach the wrong database by accident.
 *
 * Prints counts and cell positions only: never names, emails or amounts.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createDb } from '@hub/db';
import { projectRef } from './cli-ref';
import { load } from './load';
import { transform } from './transform';
import { verify } from './verify';
import { readWorkbook } from './workbook';

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

function findOne(dir: string, test: (name: string) => boolean, label: string): string {
  const found = readdirSync(dir).filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$') && test(f));
  if (found.length !== 1) fail(`Expected exactly one ${label} .xlsx in ${dir}, found ${found.length}.`);
  return path.join(dir, found[0]!);
}

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--target');
  const write = args.includes('--write');
  const verifyOnly = args.includes('--verify');
  const target = args[args.indexOf('--target') + 1];
  if (!dir || !existsSync(dir)) fail('Usage: npm run import -- <snapshot folder> [--write | --verify] --target <project ref>');

  const accessFile = findOne(dir, (f) => f.startsWith('Access Control'), 'Access Control');
  const cashFile = findOne(dir, (f) => f.startsWith('Cash Balancing'), 'Cash Balancing');
  console.log(`Reading ${path.basename(accessFile)} and ${path.basename(cashFile)}`);

  const { plan, problems } = transform(await readWorkbook(accessFile), await readWorkbook(cashFile));
  for (const [table, rows] of Object.entries(plan)) console.log(`  ${table.padEnd(20)} ${rows.length}`);
  if (problems.length) {
    console.error(`\n${problems.length} problems. Nothing was written. Fix the sheet (in the copy) and download again:`);
    for (const p of problems.slice(0, 50)) console.error(`  ${p.tab} row ${p.row}, ${p.column || '-'}: ${p.message}`);
    if (problems.length > 50) console.error(`  ... and ${problems.length - 50} more`);
    process.exit(1);
  }
  console.log('No problems.');
  if (!write && !verifyOnly) return console.log('Dry run: nothing written. Add --write --target <ref> to import.');

  if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
  const url = process.env.DATABASE_URL;
  if (!url) fail('DATABASE_URL is not set.');
  const ref = projectRef(url);
  if (!ref) fail('Cannot tell which Supabase project DATABASE_URL points at.');
  if (target !== ref) fail(`DATABASE_URL points at project "${ref}". Pass --target ${ref} if that is really the one.`);

  const db = createDb(url);
  if (write) {
    const started = performance.now();
    await load(db, plan);
    console.log(`\nImported into ${ref} in ${((performance.now() - started) / 1000).toFixed(1)}s.`);
  }
  const report = await verify(db, plan);
  console.log('\nChecks:');
  for (const n of report.notes) console.log(`  ok    ${n}`);
  for (const f of report.failures) console.log(`  FAIL  ${f}`);
  await db.$client.end();
  if (report.failures.length) fail(`${report.failures.length} checks failed.`);
  console.log('\nAll checks passed.');
}

await main();
