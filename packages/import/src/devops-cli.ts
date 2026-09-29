/**
 * npm run import:devops -- <snapshot folder>                         read and check; writes nothing
 * npm run import:devops -- <snapshot folder> --write --target <ref>  import, then verify
 * npm run import:devops -- <snapshot folder> --verify --target <ref> verify only
 *
 * The folder holds the Projects Management spreadsheet as .xlsx (File → Download →
 * Microsoft Excel), a file whose name contains "Project". Keep it OUTSIDE the repo.
 * <ref> is the Supabase project ref of DATABASE_URL, typed out so the import cannot
 * reach the wrong database by accident. JM DevOps' own command: the app stays
 * separable (CLAUDE.md §3).
 *
 * Prints counts and cell positions only: never names, titles or text.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { admins, createDb, users } from '@hub/db';
import { eq } from 'drizzle-orm';
import { projectRef } from './cli-ref';
import { loadDevops, matchAdmin, transformDevops, verifyDevops } from './devops';
import { readWorkbook } from './workbook';

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--target');
  const write = args.includes('--write');
  const verifyOnly = args.includes('--verify');
  const target = args[args.indexOf('--target') + 1];
  if (!dir || !existsSync(dir)) fail('Usage: npm run import:devops -- <snapshot folder> [--write | --verify] --target <project ref>');

  const found = readdirSync(dir).filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$') && /project/i.test(f));
  if (found.length !== 1) fail(`Expected exactly one .xlsx with "Project" in its name in ${dir}, found ${found.length}.`);
  const file = path.join(dir, found[0]!);
  console.log(`Reading ${path.basename(file)}`);

  const { projects, problems } = transformDevops(await readWorkbook(file));
  console.log(`  projects             ${projects.length}`);
  console.log(`  issues               ${projects.reduce((n, p) => n + p.issues.length, 0)}`);
  console.log(`  notes, as comments   ${projects.reduce((n, p) => n + p.issues.filter((i) => i.notes).length, 0)}`);
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
  // The admins, with their names: who an assignee's text can be matched to.
  const people = await db.select({ email: admins.email, fullName: users.fullName }).from(admins).innerJoin(users, eq(users.email, admins.email));
  const assigned = projects.flatMap((p) => p.issues).filter((i) => i.assigneeText);
  const matched = assigned.filter((i) => matchAdmin(i.assigneeText, people)).length;
  console.log(`  assignees matched to an admin  ${matched} of ${assigned.length} (the rest keep the sheet's text)`);
  if (write) {
    const started = performance.now();
    await loadDevops(db, projects, people);
    console.log(`\nImported into ${ref} in ${((performance.now() - started) / 1000).toFixed(1)}s.`);
  }
  const report = await verifyDevops(db, projects, people);
  console.log('\nChecks:');
  for (const n of report.notes) console.log(`  ok    ${n}`);
  for (const f of report.failures) console.log(`  FAIL  ${f}`);
  await db.$client.end();
  if (report.failures.length) fail(`${report.failures.length} checks failed.`);
  console.log('\nAll checks passed.');
}

await main();
