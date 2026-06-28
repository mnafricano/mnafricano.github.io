import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  analyzeAudit,
  deduplicate,
  extractContractCandidates,
  isoDate,
  mapRows,
  parseCsv,
  parseMoney,
  suggestMapping,
  summarizeFindings
} from "../core.js";

test("CSV parser handles quoted commas, escaped quotes, and CRLF", () => {
  const parsed = parseCsv('client,description,amount\r\n"Acme, Inc.","Said ""hello""",1,200\r\n');
  assert.deepEqual(parsed.headers, ["client", "description", "amount"]);
  assert.equal(parsed.rows[0].client, "Acme, Inc.");
  assert.equal(parsed.rows[0].description, 'Said "hello"');
});

test("CSV parser rejects malformed and duplicate headers", () => {
  assert.throws(() => parseCsv("client,client\nA,B\n"), /unique/);
  assert.throws(() => parseCsv('client,note\nA,"unfinished\n'), /unclosed/);
  assert.throws(() => parseCsv("client\n"), /data row/);
});

test("money and date parsing are cautious", () => {
  assert.equal(parseMoney("$1,234.56"), 1234.56);
  assert.equal(parseMoney("(42.10)"), -42.1);
  assert.equal(parseMoney("twelve"), null);
  assert.equal(isoDate("06/28/2026"), "2026-06-28");
  assert.equal(isoDate("13/45/2026"), "");
  assert.equal(isoDate("2026-02-31"), "");
  assert.equal(addDays("2026-01-30", 5), "2026-02-04");
});

test("field suggestions and row mapping validate required values", () => {
  const parsed = parseCsv("client_name,invoice_number,invoice_date,amount\nAcme,A-1,2026-01-02,$500\n");
  const mapping = suggestMapping(parsed.headers, "invoices");
  assert.equal(mapping.clientName, "client_name");
  const records = mapRows(parsed, "invoices", mapping);
  assert.equal(records[0].amount, 500);
  assert.equal(records[0].invoiceDate, "2026-01-02");
  assert.throws(() => mapRows(parsed, "invoices", { ...mapping, amount: "" }), /required fields/i);
});

test("duplicate imports use stable business keys", () => {
  const existing = [{ clientName: "Acme", invoiceNumber: "A-1" }];
  const incoming = [
    { clientName: " acme ", invoiceNumber: "a-1" },
    { clientName: "Acme", invoiceNumber: "A-2" }
  ];
  const result = deduplicate(existing, incoming, "invoices");
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.records.length, 2);
});

test("contract candidate extraction recognizes disclosed deterministic patterns", () => {
  const text = `
    Client Name: Acme Health  Effective Date: 01/15/2025
    Hourly Rate: $200.00
    Monthly Retainer: $8,000
    The retainer includes 40 hours.
    Payment is due Net 30.
    Annual price increase: 5%
    Renewal Date: 01/15/2027
  `;
  const candidate = extractContractCandidates(text);
  assert.equal(candidate.clientName, "Acme Health");
  assert.equal(candidate.hourlyRate, 200);
  assert.equal(candidate.retainerAmount, 8000);
  assert.equal(candidate.includedHours, 40);
  assert.equal(candidate.paymentTermsDays, 30);
  assert.equal(candidate.annualIncreasePercent, 5);
  assert.equal(candidate.startDate, "2025-01-15");
  assert.equal(candidate.endDate, "2027-01-15");
});

function fixture() {
  return {
    clients: [{ id: "c1", name: "Acme" }, { id: "c2", name: "No Rate LLC" }],
    contracts: [
      {
        id: "co1", clientName: "Acme", hourlyRate: 200, retainerAmount: 8000,
        includedHours: 40, paymentTermsDays: 30, annualIncreasePercent: 5,
        startDate: "2024-01-01", endDate: "2026-07-15", confirmed: true, sourceName: "Acme.pdf"
      },
      {
        id: "co2", clientName: "No Rate LLC", hourlyRate: null, retainerAmount: null,
        includedHours: null, paymentTermsDays: 30, annualIncreasePercent: 0,
        startDate: "2026-01-01", endDate: "2027-01-01", confirmed: true
      }
    ],
    invoices: [
      { id: "i1", clientName: "Acme", invoiceNumber: "A-1", invoiceDate: "2026-05-01", dueDate: "2026-05-31", amount: 6000, hours: 35, rate: 180 },
      { id: "i2", clientName: "Acme", invoiceNumber: "A-2", invoiceDate: "2026-06-01", dueDate: "2026-06-15", amount: 6000, hours: 30, rate: 200 }
    ],
    payments: [{ id: "p1", clientName: "Acme", invoiceNumber: "A-1", paymentDate: "2026-06-05", amount: 2000 }],
    timeEntries: [
      { id: "t1", clientName: "Acme", date: "2026-06-02", hours: 50, billable: true, invoiced: true, invoiceNumber: "A-2" },
      { id: "t2", clientName: "Acme", date: "2026-06-20", hours: 5, billable: true, invoiced: false, invoiceNumber: "" },
      { id: "t3", clientName: "No Rate LLC", date: "2026-06-20", hours: 3, billable: true, invoiced: false, invoiceNumber: "" }
    ]
  };
}

test("analysis covers every revenue rule and does not invent missing values", () => {
  const findings = analyzeAudit(fixture(), "2026-06-28");
  const categories = new Set(findings.map((finding) => finding.category));
  for (const category of ["unbilled", "underbilling", "retainer", "overdue", "increase", "renewal", "scope"]) {
    assert.ok(categories.has(category), `expected ${category} finding`);
  }
  const incomplete = findings.find((finding) => finding.clientName === "No Rate LLC" && finding.category === "unbilled");
  assert.equal(incomplete.amount, null);
  assert.equal(incomplete.status, "incomplete");
  assert.match(incomplete.explanation, /no confirmed hourly rate/i);
});

test("analysis reconciles partial payments and rounds money", () => {
  const findings = analyzeAudit(fixture(), "2026-06-28");
  const overdue = findings.find((finding) => finding.category === "overdue" && finding.title.includes("A-1"));
  assert.equal(overdue.amount, 4000);
  assert.match(overdue.explanation, /\$6,000\.00 invoiced/);
  assert.ok(findings.every((finding) => finding.amount === null || Number.isInteger(finding.amount * 100)));
});

test("summary excludes incomplete estimates and separates reporting buckets", () => {
  const summary = summarizeFindings([
    { category: "unbilled", amount: 100, status: "complete", severity: "high" },
    { category: "overdue", amount: 50, status: "complete", severity: "critical" },
    { category: "scope", amount: 75, status: "complete", severity: "medium" },
    { category: "unbilled", amount: null, status: "incomplete", severity: "medium" }
  ]);
  assert.equal(summary.recoverable, 100);
  assert.equal(summary.overdue, 50);
  assert.equal(summary.renewalRisk, 75);
  assert.deepEqual(summary.severity, { high: 1, critical: 1, medium: 2 });
});

test("empty datasets produce an empty, stable report", () => {
  assert.deepEqual(analyzeAudit({ clients: [], contracts: [], invoices: [], payments: [], timeEntries: [] }, "2026-06-28"), []);
});
