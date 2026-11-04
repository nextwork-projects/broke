// Run: node src/lib/statement-pdf.test.ts
import assert from "node:assert/strict";
import { applyMapping } from "./statement.ts";
import { pdfToTable, type PdfItem } from "./statement-pdf.ts";

const at = (y: number, ...cells: [string, number][]): PdfItem[] => cells.map(([str, x]) => ({ str, x, right: x + str.length * 5, y, page: 1 }));
const right = (y: number, str: string, edge: number): [string, number] => { void y; return [str, edge - str.length * 5]; };
// A typical layout: separate money-out and money-in columns and a balance, with a wrapped description.
const items = [
  ...at(800, ["Statement for October 2026", 50]),
  ...at(700, ["Date", 50], ["Details", 120], right(700, "Withdrawals", 380), right(700, "Deposits", 460), right(700, "Balance", 540)),
  ...at(680, ["02/10/2026", 50], ["Trader Joes", 120], right(680, "45.10", 380), right(680, "954.90", 540)),
  ...at(665, ["store 123", 120]),
  ...at(650, ["03/10/2026", 50], ["Payroll", 120], right(650, "2,000.00", 460), right(650, "2,954.90", 540)),
  ...at(620, ["Closing balance", 50], right(620, "2,954.90", 540)),
  ...at(600, ["Page 1 of 1", 50]),
];
const p = pdfToTable(items, "en-US")!;
assert.deepEqual(p.table.header, ["Date", "Description", "Withdrawals", "Deposits", "Balance"]);
assert.deepEqual(p.table.rows[0], ["02/10/2026", "Trader Joes store 123", "45.10", "", "954.90"]);
assert.equal(p.table.rows.length, 2); // closing balance and page number are not transactions
const { rows } = applyMapping(p.table, p.mapping, "en-US");
assert.deepEqual(rows.map((r) => r.amount), [45.1, -2000]); // out positive, in negative; balance ignored

// "12 Oct" in separate items with no year: uses the year printed on the statement.
const noYear = pdfToTable([...at(800, ["Period ending 31 Oct 2026", 50]), ...at(650, ["12", 50], ["Oct", 65], ["Coffee", 120], right(650, "4.50", 400))], "en-GB")!;
assert.match(noYear.table.rows[0][0], /12 Oct 2026/);
assert.equal(noYear.table.header[2], "Amount");

assert.equal(pdfToTable(at(700, ["Welcome to your bank", 50]), "en-US"), null); // no transactions
assert.equal(pdfToTable([], "en-US"), null); // a scan has no text

console.log("statement-pdf: ok");
