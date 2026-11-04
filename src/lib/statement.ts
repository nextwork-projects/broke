// Bank statement import: CSV, OFX and QIF to transactions. Pure, no "@/" imports, so statement.test.ts runs with plain node.
// Output uses the app's sign: positive = money out.

export type Row = { date: string; amount: number; name: string; key: string };
export type Table = { header: string[]; rows: string[][] };
export type DateOrder = "dmy" | "mdy" | "ymd";
// Column indexes; -1 = not used. A single signed amount, or separate debit (out) and credit (in) columns.
export type Mapping = { date: number; name: number; amount: number; debit: number; credit: number; order: DateOrder; outPositive: boolean };
export type Parsed = { kind: "csv"; table: Table; mapping: Mapping } | { kind: "ofx" | "qif"; rows: Row[] };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

// "1/10/2026", "2026/10/01", "01-10-26", "1 Oct 2026", "Oct 1, 2026", "20261001", "2026-10-01 09:30", "1/10'26" (QIF).
export function parseDate(raw: string, order: DateOrder): string | null {
  const s = raw.trim().replace(/'/g, "/").replace(/[T\s]\d{1,2}:\d{2}.*$/, "");
  let y: number, m: number, d: number;
  let p: RegExpMatchArray | null;
  if ((p = s.match(/^(\d{4})(\d{2})(\d{2})/))) [y, m, d] = [+p[1], +p[2], +p[3]];
  else if ((p = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) [y, m, d] = [+p[1], +p[2], +p[3]];
  else if ((p = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    [d, m] = order === "mdy" ? [+p[2], +p[1]] : [+p[1], +p[2]];
    y = +p[3];
  } else if ((p = s.match(/^(\d{1,2})[-\s/]([a-z]{3})[a-z]*[-\s/,]+(\d{2}|\d{4})$/i))) [d, m, y] = [+p[1], MONTHS.indexOf(p[2].toLowerCase()) + 1, +p[3]];
  else if ((p = s.match(/^([a-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})$/i))) [m, d, y] = [MONTHS.indexOf(p[1].toLowerCase()) + 1, +p[2], +p[3]];
  else return null;
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return new Date(iso + "T00:00:00Z").getUTCDate() === d ? iso : null; // rejects 31 Feb
}

const NUMERIC_DATE = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/;
// Which way round dd/mm and mm/dd go: the data decides when a day is over 12, else the country's own date format.
export function dateOrder(values: string[], locale: string): DateOrder {
  if (values.some((v) => /^\s*\d{4}[-/.]?\d{2}/.test(v))) return "ymd";
  let dmy = false, mdy = false;
  for (const v of values) {
    const p = v.trim().match(NUMERIC_DATE);
    if (!p) continue;
    if (+p[1] > 12) dmy = true;
    if (+p[2] > 12) mdy = true;
  }
  if (dmy !== mdy) return dmy ? "dmy" : "mdy";
  const parts = new Intl.DateTimeFormat(locale).formatToParts(new Date(Date.UTC(2020, 11, 31)));
  const i = (t: string) => parts.findIndex((x) => x.type === t);
  return i("month") < i("day") ? "mdy" : "dmy";
}

// "1,234.56", "1.234,56", "1,25,000.00", "-$45.20", "(12.00)", "12.00 DR", "£3.50". Empty or "-" = null.
export function parseAmount(raw: string, locale = "en-US"): number | null {
  let s = raw.trim();
  if (!s || s === "-") return null;
  let neg = /^\(.*\)$/.test(s) || /-/.test(s.replace(/\d[-]\d/g, "")) || /\bDR\.?$/i.test(s);
  s = s.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;
  const last = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  const sep = s[last];
  // Both marks: the last is the decimal. One mark used once: decimal unless 3 digits follow, then the country decides.
  const isDecimal = last >= 0 && (
    (s.includes(".") && s.includes(","))
    || (s.split(sep).length === 2 && (s.length - last - 1 !== 3 || sep === new Intl.NumberFormat(locale).format(1.5)[1]))
  );
  const n = isDecimal ? Number(s.slice(0, last).replace(/[.,]/g, "") + "." + s.slice(last + 1)) : Number(s.replace(/[.,]/g, ""));
  if (!Number.isFinite(n)) return null;
  if (/^-?0+(\.0+)?$/.test(String(n))) neg = false;
  return neg ? -n : n;
}

// RFC 4180-ish: quoted fields, "" escapes, newlines inside quotes.
function splitRows(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += c;
        i++;
      }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some(Boolean));
}

const looksDate = (v: string) => parseDate(v, "dmy") !== null || parseDate(v, "mdy") !== null;

// Delimiter: the one giving the most rows with the same (2+) field count. Header: the row just above the first
// row with a date in it, when it has no dates itself (skips bank preambles like ASB's account lines).
export function readTable(text: string): Table {
  const clean = text.replace(/^﻿/, "");
  let best: string[][] = [];
  let bestScore = -1;
  for (const d of [",", ";", "\t", "|"]) {
    const rows = splitRows(clean, d);
    const counts = new Map<number, number>();
    for (const r of rows) if (r.length > 1) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
    const score = Math.max(0, ...counts.values());
    if (score > bestScore) {
      bestScore = score;
      best = rows;
    }
  }
  const first = best.findIndex((r) => r.length > 1 && r.some(looksDate));
  if (first < 0) return { header: [], rows: [] };
  const width = best[first].length;
  const h = best[first - 1];
  const hasHeader = !!h && h.length >= width - 1 && !h.some(looksDate);
  const header = hasHeader ? Array.from({ length: width }, (_, i) => h[i] || `Column ${i + 1}`) : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  return { header, rows: best.slice(first).filter((r) => r.length >= Math.min(width, 2)) };
}

const find = (header: string[], tests: RegExp[], skip: RegExp = /$^/) => {
  for (const t of tests) {
    const i = header.findIndex((h) => t.test(h) && !skip.test(h));
    if (i >= 0) return i;
  }
  return -1;
};

export function guessMapping(t: Table, locale: string): Mapping {
  const h = t.header.map((x) => x.toLowerCase().trim());
  const col = (i: number) => t.rows.slice(0, 50).map((r) => r[i] ?? "");
  let date = find(h, [/^(transaction |txn |posted |posting )?date$/, /date/], /value|process|created/);
  if (date < 0) date = h.findIndex((_, i) => col(i).filter(looksDate).length > col(i).length / 2);
  let name = find(h, [/payee/, /counter ?party/, /^name$/, /^details$/, /narration/, /description/, /merchant/, /memo/, /particulars/, /reference/]);
  if (name < 0) name = h.findIndex((_, i) => i !== date && col(i).some((v) => /[a-z]{3}/i.test(v) && parseAmount(v) === null));
  const amount = find(h, [/^amount$/, /^amount\b/, /amount/, /betrag|montant|importe|importo|bedrag|belopp|monto|valor/], /balance|foreign|local|credit|debit|\bcr\b|\bdr\b/);
  const debit = amount >= 0 ? -1 : find(h, [/withdrawal/, /debit/, /money out/, /paid out/, /^dr$/, /\bout\b/]);
  const credit = amount >= 0 ? -1 : find(h, [/deposit/, /credit/, /money in/, /paid in/, /^cr$/, /\bin\b/]);
  return { date, name, amount, debit, credit, order: dateOrder(date >= 0 ? col(date) : [], locale), outPositive: false };
}

// Stable dedupe keys: the same date, amount and name gets 1, 2, 3... in file order, so re-importing adds nothing.
export function withKeys(rows: Omit<Row, "key">[], ids?: (string | undefined)[]): Row[] {
  const seen = new Map<string, number>();
  return rows.map((r, i) => {
    const base = `${r.date}|${r.amount.toFixed(2)}|${r.name.toLowerCase()}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...r, key: ids?.[i] ? `id:${ids[i]}` : `${base}|${n}` };
  });
}

export function applyMapping(t: Table, m: Mapping, locale: string): { rows: Row[]; skipped: number } {
  const out: Omit<Row, "key">[] = [];
  let skipped = 0;
  for (const r of t.rows) {
    const date = m.date >= 0 ? parseDate(r[m.date] ?? "", m.order) : null;
    let amount: number | null = null;
    if (m.amount >= 0) {
      const a = parseAmount(r[m.amount] ?? "", locale);
      // Most banks export money out as negative; the app stores it as positive.
      if (a !== null) amount = m.outPositive ? a : -a;
    } else {
      const dr = m.debit >= 0 ? parseAmount(r[m.debit] ?? "", locale) : null;
      const cr = m.credit >= 0 ? parseAmount(r[m.credit] ?? "", locale) : null;
      if (dr !== null || cr !== null) amount = Math.abs(dr ?? 0) - Math.abs(cr ?? 0);
    }
    const name = (m.name >= 0 ? r[m.name] ?? "" : "").replace(/\s+/g, " ").trim();
    if (!date || amount === null || !amount) skipped++;
    else out.push({ date, amount: Math.round(amount * 100) / 100, name: name || "Imported transaction" });
  }
  return { rows: withKeys(out), skipped };
}

// OFX 1.x (SGML, unclosed tags) and 2.x (XML). TRNAMT is negative for money out. FITID is the bank's own id.
function parseOfx(text: string): Row[] {
  const tag = (block: string, t: string) => block.match(new RegExp(`<${t}>([^<\\r\\n]*)`, "i"))?.[1].trim() ?? "";
  const rows: Omit<Row, "key">[] = [];
  const ids: string[] = [];
  for (const b of text.split(/<STMTTRN>/i).slice(1)) {
    const date = parseDate(tag(b, "DTPOSTED"), "ymd");
    const amt = parseAmount(tag(b, "TRNAMT"));
    if (!date || !amt) continue;
    rows.push({ date, amount: -amt, name: (tag(b, "NAME") || tag(b, "MEMO") || "Imported transaction").replace(/&amp;/g, "&") });
    ids.push(tag(b, "FITID"));
  }
  return withKeys(rows, ids);
}

// QIF: one field per line (D date, T amount, P payee, M memo), records end with "^". Negative T = money out.
function parseQif(text: string, order: DateOrder, locale: string): Row[] {
  const rows: Omit<Row, "key">[] = [];
  for (const rec of text.split(/^\^\s*$/m)) {
    const f: Record<string, string> = {};
    for (const line of rec.split(/\r?\n/)) if (/^[A-Z]/.test(line) && !line.startsWith("!")) f[line[0]] ??= line.slice(1).trim();
    const date = f.D ? parseDate(f.D, order) : null;
    const amt = f.T ? parseAmount(f.T, locale) : null;
    if (date && amt) rows.push({ date, amount: -amt, name: f.P || f.M || "Imported transaction" });
  }
  return withKeys(rows);
}

export function parseStatement(text: string, filename: string, locale: string): Parsed {
  if (/<OFX>|OFXHEADER/i.test(text) || /\.(ofx|qfx)$/i.test(filename)) return { kind: "ofx", rows: parseOfx(text) };
  if (/^\s*!Type:/i.test(text) || /\.qif$/i.test(filename)) {
    const dates = [...text.matchAll(/^D(.+)$/gm)].map((m) => m[1].replace(/'/g, "/"));
    return { kind: "qif", rows: parseQif(text, dateOrder(dates, locale), locale) };
  }
  const table = readTable(text);
  return { kind: "csv", table, mapping: guessMapping(table, locale) };
}
