/**
 * An .xlsx download of a spreadsheet -> { tab: rows }, each row keyed by its header.
 *
 * Headers are read from row 1 at run time, never assumed by position (RBAC §4: a
 * reordered column must not silently move data). Fully blank rows are skipped.
 */

import ExcelJS from 'exceljs';
import type { Cell } from './cells';

export interface SheetRow {
  /** The spreadsheet's row number, for problem reports. */
  row: number;
  cells: Record<string, Cell>;
}

export type Workbook = Record<string, SheetRow[]>;

/** exceljs's cell value -> the few shapes cells.ts understands. */
export function toCell(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('error' in v) return { error: String(v.error) };
    if ('hyperlink' in v) {
      const t = (v as { text?: unknown }).text;
      const label = typeof t === 'string' ? t : Array.isArray((t as { richText?: unknown })?.richText)
        ? (t as { richText: { text: string }[] }).richText.map((r) => r.text).join('')
        : String(v.hyperlink);
      return { text: label, hyperlink: String(v.hyperlink) };
    }
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return toCell((v as { result?: ExcelJS.CellValue }).result ?? null);
  }
  return String(v);
}

export async function readWorkbook(path: string): Promise<Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const out: Workbook = {};
  for (const ws of wb.worksheets) {
    const header = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((h) => String(toCell(h) ?? '').trim());
    const rows: SheetRow[] = [];
    ws.eachRow((r, n) => {
      if (n === 1) return;
      const values = (r.values as ExcelJS.CellValue[]).slice(1);
      const cells: Record<string, Cell> = {};
      header.forEach((h, i) => {
        if (h) cells[h] = toCell(values[i] ?? null);
      });
      if (Object.values(cells).some((c) => c !== null && c !== '')) rows.push({ row: n, cells });
    });
    out[ws.name] = rows;
  }
  return out;
}
