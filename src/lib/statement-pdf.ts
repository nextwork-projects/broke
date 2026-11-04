// PDF bank statements to a table for the same review step as a CSV. Pure, no "@/" imports, so
// `node src/lib/statement-pdf.test.ts` runs it. The text comes out of the PDF in the browser, so the file never leaves the device.
import { guessMapping, parseAmount, parseDate, type Mapping, type Table } from "./statement.ts";

export type PdfItem = { str: string; x: number; right: number; y: number; page: number };
type Line = PdfItem[];

// Text items sharing a baseline, left to right.
function toLines(items: PdfItem[]): Line[] {
  const lines: Line[] = [];
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  for (const it of sorted) {
    const last = lines.at(-1);
    if (last && last[0].page === it.page && Math.abs(last[0].y - it.y) < 3) last.push(it);
    else lines.push([it]);
  }
  for (const l of lines) l.sort((a, b) => a.x - b.x);
  return lines;
}

// A figure: digits and separators, with at most a sign, a currency mark and a CR or DR. "store 123" isn't one.
const isMoney = (s: string, locale: string) => {
  const t = s.replace(/\s?(cr|dr)$/i, "");
  return /^[-+(]?\s?(?:[^\d\sA-Za-z]{1,2}|[A-Z]{3}\s?)?\s?\d[\d.,\s]*\)?-?$/.test(t) && parseAmount(t, locale) !== null;
};

// The date at the start of a line: one to three text items ("12/10/2026", "12 Oct 2026", "12", "Oct"). Statements that
// leave the year off get the year printed elsewhere in the document.
function dateAtStart(line: Line, year: string | null): { text: string; used: number } | null {
  const tries: [string, number][] = [];
  for (let n = 1; n <= Math.min(3, line.length); n++) tries.push([line.slice(0, n).map((i) => i.str.trim()).join(" "), n]);
  for (const [text, used] of [...tries].reverse()) {
    for (const t of [text, year ? `${text} ${year}` : ""]) {
      if (t && /\d/.test(t) && !/^\d+$/.test(t) && (parseDate(t, "dmy") || parseDate(t, "mdy"))) return { text: t, used };
    }
  }
  return null;
}

const STOP = /^(page \d|total|closing balance|opening balance|balance (brought|carried)|statement|continued)/i;

/** The statement's transactions as a table, or null when no dated money lines are found (a scan, or not a statement). */
export function pdfToTable(items: PdfItem[], locale: string): { table: Table; mapping: Mapping } | null {
  const lines = toLines(items);
  const year = items.map((i) => i.str).join(" ").match(/\b20\d\d\b/)?.[0] ?? null;

  type Tx = { index: number; firstPage: number; firstY: number; date: string; words: string[]; money: { text: string; right: number }[] };
  const txs: Tx[] = [];
  lines.forEach((line, index) => {
    const d = dateAtStart(line, year);
    if (d) {
      const rest = line.slice(d.used);
      let cut = rest.length;
      while (cut > 0 && isMoney(rest[cut - 1].str.trim(), locale)) cut--;
      const money = rest.slice(cut).map((i) => ({ text: i.str.trim(), right: i.right }));
      if (money.length) return void txs.push({ index, firstPage: line[0].page, firstY: line[0].y, date: d.text, words: rest.slice(0, cut).map((i) => i.str.trim()), money });
    }
    // A description running on under the row above: no date, no money, right after a transaction.
    const prev = txs.at(-1);
    const text = line.map((i) => i.str.trim()).join(" ");
    if (prev && prev.index === index - 1 && !STOP.test(text) && !line.some((i) => isMoney(i.str.trim(), locale)) && text.length < 80) {
      prev.words.push(text);
      prev.index = index;
    }
  });
  if (!txs.length) return null;

  // Number columns, by where the figures end on the page (they're right-aligned).
  const edges: number[] = [];
  for (const t of txs) for (const m of t.money) if (!edges.some((e) => Math.abs(e - m.right) < 14)) edges.push(m.right);
  edges.sort((a, b) => a - b);

  // Column names from the heading row above the first transaction, when there is one.
  const firstLine = lines.findIndex((l) => l[0].page === txs[0].firstPage && l[0].y === txs[0].firstY);
  const head = lines.slice(Math.max(0, firstLine - 4), firstLine).reverse().find((l) => !l.some((i) => /\d/.test(i.str)) && edges.some((e) => l.some((i) => Math.abs(i.right - e) < 30)));
  const names = edges.map((e, i) => head?.find((it) => Math.abs(it.right - e) < 30 && /[a-z]/i.test(it.str))?.str.trim() || (edges.length === 1 ? "Amount" : `Amount ${i + 1}`));

  const table: Table = {
    header: ["Date", "Description", ...names],
    rows: txs.map((t) => [t.date, t.words.join(" "), ...edges.map((e) => t.money.find((m) => Math.abs(m.right - e) < 14)?.text ?? "")]),
  };
  return { table, mapping: guessMapping(table, locale) };
}
