import { z } from "zod";
import { isoDate } from "../../../../supabase/functions/_shared/domain";

export type ImportKind = "invoices" | "payments" | "time_entries";

const aliases: Record<string, string[]> = {
  client_name: [
    "client",
    "client name",
    "client_name",
    "customer",
    "customer name",
  ],
  invoice_number: [
    "invoice",
    "invoice #",
    "invoice number",
    "invoice_number",
    "number",
  ],
  invoice_date: ["invoice date", "invoice_date", "issued", "issue date"],
  due_date: ["due", "due date", "due_date"],
  payment_date: ["payment date", "payment_date", "paid date", "date paid"],
  amount: ["amount", "total", "invoice total", "payment amount"],
  hours: ["hours", "billable hours", "billed hours", "duration"],
  rate: ["rate", "hourly rate", "bill rate"],
  status: ["status", "invoice status"],
  date: ["date", "work date", "entry date"],
  billable: ["billable", "is billable"],
  invoiced: ["invoiced", "is invoiced", "billed"],
  description: ["description", "task", "notes", "work"],
};

const required: Record<ImportKind, string[]> = {
  invoices: ["client_name", "invoice_number", "invoice_date", "amount"],
  payments: ["client_name", "invoice_number", "payment_date", "amount"],
  time_entries: ["client_name", "date", "hours"],
};

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export interface CsvImportResult {
  kind: ImportKind;
  rows: Record<string, unknown>[];
  mapping: Record<string, string>;
  duplicateKeys: string[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function parseCsv(text: string): ParsedCsv {
  const source = text.replace(/^\uFEFF/, "");
  const matrix: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) matrix.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted value.");
  row.push(value);
  if (row.some((cell) => cell.trim())) matrix.push(row);
  if (matrix.length < 2)
    throw new Error("The CSV needs a header and at least one data row.");
  const headers = matrix[0].map((cell) => cell.trim());
  if (headers.some((header) => !header))
    throw new Error("Every CSV column needs a header.");
  if (new Set(headers.map(normalize)).size !== headers.length)
    throw new Error("CSV headers must be unique.");
  return {
    headers,
    rows: matrix
      .slice(1)
      .map((cells) =>
        Object.fromEntries(
          headers.map((header, index) => [header, (cells[index] || "").trim()]),
        ),
      ),
  };
}

export function suggestMapping(
  headers: string[],
  kind: ImportKind,
): Record<string, string> {
  const fields = new Set([
    ...required[kind],
    ...(kind === "invoices"
      ? ["due_date", "hours", "rate", "status"]
      : kind === "time_entries"
        ? ["billable", "invoiced", "invoice_number", "description"]
        : []),
  ]);
  return Object.fromEntries(
    [...fields].map((field) => {
      const accepted = new Set((aliases[field] || [field]).map(normalize));
      return [
        field,
        headers.find((header) => accepted.has(normalize(header))) || "",
      ];
    }),
  );
}

function money(value: string): number {
  const raw = value.trim();
  const negative = /^\(.*\)$/.test(raw);
  const clean = raw.replace(/[,$£€\s()]/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(clean))
    throw new Error(`Invalid monetary value “${value}”.`);
  return Number(clean) * (negative ? -1 : 1);
}

function number(value: string): number | null {
  if (!value.trim()) return null;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Invalid number “${value}”.`);
  return result;
}

function bool(value: string, fallback: boolean): boolean {
  const normalized = normalize(value);
  if (["yes", "true", "1", "y", "billable", "invoiced"].includes(normalized))
    return true;
  if (
    ["no", "false", "0", "n", "not invoiced", "non billable"].includes(
      normalized,
    )
  )
    return false;
  return fallback;
}

export function mapCsv(
  parsed: ParsedCsv,
  kind: ImportKind,
  mapping = suggestMapping(parsed.headers, kind),
): CsvImportResult {
  const missing = required[kind].filter((field) => !mapping[field]);
  if (missing.length)
    throw new Error(`Missing required columns: ${missing.join(", ")}.`);
  const get = (row: Record<string, string>, field: string) =>
    mapping[field] ? row[mapping[field]] || "" : "";
  const duplicateKeys: string[] = [];
  const seen = new Set<string>();
  const rows = parsed.rows
    .map((row, index) => {
      const clientName = get(row, "client_name").trim();
      if (!clientName)
        throw new Error(`Row ${index + 2} is missing a client name.`);
      if (kind === "invoices") {
        const invoiceDate = isoDate(get(row, "invoice_date"));
        if (!invoiceDate)
          throw new Error(`Row ${index + 2} has an invalid invoice date.`);
        const record = {
          client_name: clientName,
          invoice_number: get(row, "invoice_number").trim(),
          invoice_date: invoiceDate,
          due_date: isoDate(get(row, "due_date")) || null,
          amount: money(get(row, "amount")),
          hours: number(get(row, "hours")),
          rate: get(row, "rate") ? money(get(row, "rate")) : null,
          status: get(row, "status") || "open",
        };
        z.string().min(1).parse(record.invoice_number);
        return record;
      }
      if (kind === "payments") {
        const paymentDate = isoDate(get(row, "payment_date"));
        if (!paymentDate)
          throw new Error(`Row ${index + 2} has an invalid payment date.`);
        return {
          client_name: clientName,
          invoice_number: get(row, "invoice_number").trim(),
          payment_date: paymentDate,
          amount: money(get(row, "amount")),
        };
      }
      const date = isoDate(get(row, "date"));
      if (!date) throw new Error(`Row ${index + 2} has an invalid work date.`);
      return {
        client_name: clientName,
        date,
        hours: number(get(row, "hours")),
        billable: bool(get(row, "billable"), true),
        invoiced: bool(
          get(row, "invoiced"),
          Boolean(get(row, "invoice_number")),
        ),
        invoice_number: get(row, "invoice_number"),
        description: get(row, "description"),
      };
    })
    .filter((row) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) {
        duplicateKeys.push(key);
        return false;
      }
      seen.add(key);
      return true;
    });
  return { kind, rows, mapping, duplicateKeys };
}
