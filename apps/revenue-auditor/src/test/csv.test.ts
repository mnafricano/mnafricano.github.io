import { describe, expect, it } from "vitest";
import { mapCsv, parseCsv, suggestMapping } from "../lib/csv";

describe("CSV import", () => {
  it("parses quotes, escaped values, and accounting money", () => {
    const parsed = parseCsv(
      'client_name,invoice_number,invoice_date,amount\r\n"Acme, Inc.","A-1",06/28/2026,"($1,200.50)"\r\n',
    );
    const result = mapCsv(parsed, "invoices");
    expect(result.rows[0]).toMatchObject({
      client_name: "Acme, Inc.",
      amount: -1200.5,
      invoice_date: "2026-06-28",
    });
  });

  it("maps common aliases", () => {
    expect(
      suggestMapping(
        ["Customer", "Invoice #", "Issue Date", "Total"],
        "invoices",
      ),
    ).toMatchObject({
      client_name: "Customer",
      invoice_number: "Invoice #",
      invoice_date: "Issue Date",
      amount: "Total",
    });
  });

  it("rejects malformed files and impossible dates", () => {
    expect(() => parseCsv("client,client\nA,B\n")).toThrow(/unique/i);
    expect(() => parseCsv('client,note\nA,"unfinished\n')).toThrow(/unclosed/i);
    expect(() =>
      mapCsv(
        parseCsv(
          "client_name,invoice_number,invoice_date,amount\nAcme,A-1,2026-02-31,10\n",
        ),
        "invoices",
      ),
    ).toThrow(/invalid invoice date/i);
  });

  it("skips exact in-file duplicates", () => {
    const parsed = parseCsv(
      "client_name,payment_date,invoice_number,amount\nAcme,2026-01-01,A-1,10\nAcme,2026-01-01,A-1,10\n",
    );
    const result = mapCsv(parsed, "payments");
    expect(result.rows).toHaveLength(1);
    expect(result.duplicateKeys).toHaveLength(1);
  });
});
