// node src/lib/statement.test.ts
// Samples are shaped like each bank's export (columns, date style, preamble); names and amounts are made up.
import assert from "node:assert/strict";
import { applyMapping, dateOrder, parseAmount, parseDate, parseStatement, type Row } from "./statement.ts";

const csv = (text: string, locale: string) => {
  const p = parseStatement(text, "statement.csv", locale);
  assert.equal(p.kind, "csv");
  if (p.kind !== "csv") throw 0;
  return { ...p, ...applyMapping(p.table, p.mapping, locale) };
};
const brief = (rows: Row[]) => rows.map((r) => [r.date, r.amount, r.name]);

// Dates and amounts.
assert.equal(parseDate("03/04/2026", "dmy"), "2026-04-03");
assert.equal(parseDate("03/04/2026", "mdy"), "2026-03-04");
assert.equal(parseDate("2026/10/01", "dmy"), "2026-10-01");
assert.equal(parseDate("1 Oct 2026", "dmy"), "2026-10-01");
assert.equal(parseDate("05-Jan-26", "dmy"), "2026-01-05");
assert.equal(parseDate("Oct 5, 2026", "dmy"), "2026-10-05");
assert.equal(parseDate("20261001120000[+12:NZST]", "ymd"), "2026-10-01");
assert.equal(parseDate("31/02/2026", "dmy"), null);
assert.equal(parseDate("Balance", "dmy"), null);
assert.equal(dateOrder(["01/02/2026", "25/02/2026"], "en-US"), "dmy", "a day over 12 wins over the locale");
assert.equal(dateOrder(["01/02/2026"], "en-US"), "mdy");
assert.equal(dateOrder(["01/02/2026"], "en-NZ"), "dmy");
assert.equal(parseAmount("1,234.56"), 1234.56);
assert.equal(parseAmount("1.234,56", "de-DE"), 1234.56);
assert.equal(parseAmount("12,50", "de-DE"), 12.5);
assert.equal(parseAmount("1,25,000.00", "en-IN"), 125000);
assert.equal(parseAmount("-$45.20"), -45.2);
assert.equal(parseAmount("(12.00)"), -12);
assert.equal(parseAmount("12.00 DR"), -12);
assert.equal(parseAmount("£3.50"), 3.5);
assert.equal(parseAmount("1,234"), 1234);
assert.equal(parseAmount(" "), null);

// NZ ASB: account preamble lines, yyyy/mm/dd, signed amount.
const asb = csv(`Created date / time : 21 October 2026 / 09:12:40
Bank 12; Branch 3011; Account 0123456-50 (Streamline)
From date 20260901
To date 20261020
Avail Bal : 1520.33 as of 20261020

Date,Unique Id,Tran Type,Cheque Number,Payee,Memo,Amount
2026/10/01,2026100101,EFTPOS,,"COUNTDOWN PONSONBY","4835-****-****-1234  Df",-84.20
2026/10/02,2026100201,D/C,,"ACME LTD","SALARY",3150.00
2026/10/02,2026100202,EFTPOS,,"COFFEE SUPREME","",-5.50
2026/10/02,2026100203,EFTPOS,,"COFFEE SUPREME","",-5.50
`, "en-NZ");
assert.equal(asb.table.header[4], "Payee");
assert.equal(asb.mapping.order, "ymd");
assert.deepEqual(brief(asb.rows), [["2026-10-01", 84.2, "COUNTDOWN PONSONBY"], ["2026-10-02", -3150, "ACME LTD"], ["2026-10-02", 5.5, "COFFEE SUPREME"], ["2026-10-02", 5.5, "COFFEE SUPREME"]]);
assert.notEqual(asb.rows[2].key, asb.rows[3].key, "two identical coffees are two rows");
assert.deepEqual(csv(asb.table.header.join(",") + "\n" + asb.table.rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n"), "en-NZ").rows.map((r) => r.key), asb.rows.map((r) => r.key), "same file, same keys");

// NZ ANZ: details/particulars/code/reference, date in column 7, dd/mm/yyyy.
const anz = csv(`Type,Details,Particulars,Code,Reference,Amount,Date,ForeignCurrencyAmount,ConversionCharge
Eft-Pos,Pak N Save Wairau,4835********1234,,,-120.45,03/10/2026,,
Bill Payment,Mercury Energy,Power,,123456,-180.00,13/10/2026,,
Direct Credit,Acme Ltd,Salary,,,2900.00,15/10/2026,,
`, "en-NZ");
assert.deepEqual(brief(anz.rows), [["2026-10-03", 120.45, "Pak N Save Wairau"], ["2026-10-13", 180, "Mercury Energy"], ["2026-10-15", -2900, "Acme Ltd"]]);

// NZ Kiwibank: credit/debit columns and a signed Amount; the signed one is used.
const kb = csv(`Account number,Date,Memo/Description,Source Code (payment type),TP ref,TP part,TP code,OP ref,OP part,OP code,OP name,OP Bank Account Number,Amount (credit),Amount (debit),Amount,Balance
38-9000-0123456-00,01-10-2026,NEW WORLD ;,POS,,,,,,,,,,45.10,-45.10,954.90
38-9000-0123456-00,14-10-2026,WAGES ACME ;,DC,,,,,,,ACME LTD,,2500.00,,2500.00,3454.90
`, "en-NZ");
assert.deepEqual(brief(kb.rows), [["2026-10-01", 45.1, "NEW WORLD ;"], ["2026-10-14", -2500, "WAGES ACME ;"]]);

// UK Monzo: Name beats Description; Amount beats Money out / Money in.
const monzo = csv(`Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In
tx_0000A1,02/10/2026,08:14:22,Card payment,Pret A Manger,,Eating out,-4.95,GBP,-4.95,GBP,,1 Old St,,PRET A MANGER LONDON GBR,,-4.95,
tx_0000A2,03/10/2026,12:00:00,Faster payment,Acme Ltd,,Income,2100.00,GBP,2100.00,GBP,,,,ACME LTD SALARY,,,2100.00
`, "en-GB");
assert.deepEqual(brief(monzo.rows), [["2026-10-02", 4.95, "Pret A Manger"], ["2026-10-03", -2100, "Acme Ltd"]]);

// UK Starling.
const starling = csv(`Date,Counter Party,Reference,Type,Amount (GBP),Balance (GBP),Spending Category,Notes
01/10/2026,Tesco,TESCO STORES 2041,CONTACTLESS,-23.40,1176.60,GROCERIES,
05/10/2026,Landlord,RENT OCT,FASTER PAYMENT,-950.00,226.60,BILLS_AND_SERVICES,
`, "en-GB");
assert.deepEqual(brief(starling.rows), [["2026-10-01", 23.4, "Tesco"], ["2026-10-05", 950, "Landlord"]]);

// India HDFC: dd/mm/yy, separate withdrawal and deposit columns, Indian digit grouping, a footer line.
const hdfc = csv(`Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
03/10/26,UPI-SWIGGY-SWIGGY@ICICI-123,0000412345678901,03/10/26,450.00,,"1,24,550.00"
05/10/26,NEFT CR-ACME PVT LTD-SALARY,N278261234,05/10/26,,"1,25,000.00","2,49,550.00"
Statement Summary,,,,,,
`, "en-IN");
assert.deepEqual(brief(hdfc.rows), [["2026-10-03", 450, "UPI-SWIGGY-SWIGGY@ICICI-123"], ["2026-10-05", -125000, "NEFT CR-ACME PVT LTD-SALARY"]]);
assert.equal(hdfc.mapping.amount, -1);

// India SBI: tab-separated, "1 Oct 2026" dates, Debit / Credit with blank cells.
const sbi = csv(`Txn Date\tValue Date\tDescription\tRef No./Cheque No.\tDebit\tCredit\tBalance
1 Oct 2026\t1 Oct 2026\tTO TRANSFER-UPI/DR/123/ZOMATO\tTRANSFER TO 4897\t320.00\t \t"10,180.00"
7 Oct 2026\t7 Oct 2026\tBY TRANSFER-NEFT*ACME\tTRANSFER FROM 1234\t \t"50,000.00"\t"60,180.00"
`, "en-IN");
assert.deepEqual(brief(sbi.rows), [["2026-10-01", 320, "TO TRANSFER-UPI/DR/123/ZOMATO"], ["2026-10-07", -50000, "BY TRANSFER-NEFT*ACME"]]);

// Germany: semicolons, dd.mm.yyyy, decimal commas.
const de = csv(`Buchungstag;Empfänger;Verwendungszweck;Betrag
02.10.2026;REWE Markt;Lebensmittel;-34,99
`, "de-DE");
assert.equal(de.mapping.date, 0);
assert.deepEqual(brief(de.rows), [["2026-10-02", 34.99, "REWE Markt"]]);

// OFX 1.x SGML: FITID makes the key.
const ofx = parseStatement(`OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261002120000.000[-5:EST]<TRNAMT>-12.34<FITID>2026100201<NAME>CORNER DELI &amp; CO<MEMO>CARD 1234</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261003<TRNAMT>1500.00<FITID>2026100301<NAME>PAYROLL</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`, "export.ofx", "en-US");
assert.equal(ofx.kind, "ofx");
if (ofx.kind === "ofx") {
  assert.deepEqual(brief(ofx.rows), [["2026-10-02", 12.34, "CORNER DELI & CO"], ["2026-10-03", -1500, "PAYROLL"]]);
  assert.equal(ofx.rows[0].key, "id:2026100201");
}

// QIF.
const qif = parseStatement(`!Type:Bank
D10/02/2026
T-42.10
PSAFEWAY
^
D10/15'26
T2000.00
PACME PAYROLL
^
`, "export.qif", "en-US");
if (qif.kind === "qif") assert.deepEqual(brief(qif.rows), [["2026-10-02", 42.1, "SAFEWAY"], ["2026-10-15", -2000, "ACME PAYROLL"]]);
else assert.fail("qif");

console.log("statement ok");
