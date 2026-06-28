export const SCHEMA_VERSION = 1;

export const FIELD_DEFINITIONS = {
  invoices: {
    required: ["clientName", "invoiceNumber", "invoiceDate", "amount"],
    fields: {
      clientName: "Client name",
      invoiceNumber: "Invoice number",
      invoiceDate: "Invoice date",
      dueDate: "Due date",
      amount: "Invoice amount",
      hours: "Billed hours",
      rate: "Billed hourly rate",
      status: "Status"
    }
  },
  payments: {
    required: ["clientName", "invoiceNumber", "paymentDate", "amount"],
    fields: {
      clientName: "Client name",
      invoiceNumber: "Invoice number",
      paymentDate: "Payment date",
      amount: "Payment amount"
    }
  },
  timeEntries: {
    required: ["clientName", "date", "hours"],
    fields: {
      clientName: "Client name",
      date: "Work date",
      hours: "Hours",
      billable: "Billable?",
      invoiced: "Invoiced?",
      invoiceNumber: "Invoice number",
      description: "Description"
    }
  }
};

const aliases = {
  clientName: ["client", "client name", "customer", "customer name", "account"],
  invoiceNumber: ["invoice", "invoice number", "invoice #", "invoice id", "number"],
  invoiceDate: ["invoice date", "issued", "issue date", "date"],
  dueDate: ["due", "due date", "payment due"],
  paymentDate: ["payment date", "paid date", "date paid", "date"],
  amount: ["amount", "total", "invoice total", "payment amount", "value"],
  hours: ["hours", "billable hours", "billed hours", "duration"],
  rate: ["rate", "hourly rate", "bill rate"],
  status: ["status", "invoice status"],
  billable: ["billable", "is billable", "billing"],
  invoiced: ["invoiced", "is invoiced", "billed"],
  description: ["description", "task", "notes", "work"]
};

export function uid(prefix = "item") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeHeader(value = "") {
  return String(value).trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function suggestMapping(headers, type) {
  const fields = FIELD_DEFINITIONS[type]?.fields || {};
  return Object.keys(fields).reduce((mapping, field) => {
    const accepted = new Set([normalizeHeader(field), ...(aliases[field] || []).map(normalizeHeader)]);
    mapping[field] = headers.find((header) => accepted.has(normalizeHeader(header))) || "";
    return mapping;
  }, {});
}

export function parseCsv(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (quoted) throw new Error("The CSV contains an unclosed quoted value.");
  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  if (rows.length < 2) throw new Error("The CSV needs a header row and at least one data row.");

  const headers = rows[0].map((cell) => cell.trim());
  if (headers.some((header) => !header)) throw new Error("Every CSV column needs a header.");
  if (new Set(headers.map(normalizeHeader)).size !== headers.length) {
    throw new Error("CSV headers must be unique.");
  }

  return {
    headers,
    rows: rows.slice(1).map((cells, index) => {
      const record = {};
      headers.forEach((header, column) => { record[header] = (cells[column] || "").trim(); });
      record.__row = index + 2;
      return record;
    })
  };
}

export function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[,$£€\s()]/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? (negative ? -amount : amount) : null;
}

export function parseNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["yes", "true", "1", "y", "billable", "invoiced"].includes(normalized)) return true;
  if (["no", "false", "0", "n", "non-billable", "not invoiced"].includes(normalized)) return false;
  return fallback;
}

export function isoDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (direct) {
    const date = new Date(`${raw}T12:00:00`);
    const [, year, month, day] = direct;
    return date.getFullYear() === Number(year)
      && date.getMonth() + 1 === Number(month)
      && date.getDate() === Number(day) ? raw : "";
  }
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, month, day, year] = slash;
    const result = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const date = new Date(`${result}T00:00:00`);
    return date.getMonth() + 1 === Number(month) && date.getDate() === Number(day) ? result : "";
  }
  return "";
}

export function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + Number(days || 0));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function daysBetween(from, to) {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end - start) / 86400000);
}

export function mapRows(parsed, type, mapping) {
  const definition = FIELD_DEFINITIONS[type];
  if (!definition) throw new Error("Choose a supported import type.");
  const missing = definition.required.filter((field) => !mapping[field]);
  if (missing.length) {
    throw new Error(`Map required fields: ${missing.map((field) => definition.fields[field]).join(", ")}.`);
  }

  const errors = [];
  const records = parsed.rows.map((row) => {
    const source = {};
    Object.keys(definition.fields).forEach((field) => {
      source[field] = mapping[field] ? row[mapping[field]] : "";
    });

    const record = { id: uid(type.slice(0, -1)), sourceRow: row.__row };
    if (type === "invoices") {
      Object.assign(record, {
        clientName: source.clientName.trim(),
        invoiceNumber: source.invoiceNumber.trim(),
        invoiceDate: isoDate(source.invoiceDate),
        dueDate: isoDate(source.dueDate),
        amount: parseMoney(source.amount),
        hours: parseNumber(source.hours),
        rate: parseMoney(source.rate),
        status: source.status.trim()
      });
      if (!record.dueDate && record.invoiceDate) record.dueDate = "";
    } else if (type === "payments") {
      Object.assign(record, {
        clientName: source.clientName.trim(),
        invoiceNumber: source.invoiceNumber.trim(),
        paymentDate: isoDate(source.paymentDate),
        amount: parseMoney(source.amount)
      });
    } else {
      Object.assign(record, {
        clientName: source.clientName.trim(),
        date: isoDate(source.date),
        hours: parseNumber(source.hours),
        billable: parseBoolean(source.billable, true),
        invoiced: parseBoolean(source.invoiced, Boolean(source.invoiceNumber)),
        invoiceNumber: source.invoiceNumber.trim(),
        description: source.description.trim()
      });
    }

    const invalid = [];
    if (!record.clientName) invalid.push("client");
    if (type !== "timeEntries" && !record.invoiceNumber) invalid.push("invoice number");
    if (type === "invoices" && !record.invoiceDate) invalid.push("invoice date");
    if (type === "payments" && !record.paymentDate) invalid.push("payment date");
    if (type === "timeEntries" && !record.date) invalid.push("work date");
    if (record.amount === null && type !== "timeEntries") invalid.push("amount");
    if (type === "timeEntries" && (record.hours === null || record.hours < 0)) invalid.push("hours");
    if (invalid.length) errors.push(`Row ${row.__row}: invalid ${invalid.join(", ")}.`);
    return record;
  });

  if (errors.length) {
    const more = errors.length > 5 ? ` Plus ${errors.length - 5} more.` : "";
    throw new Error(`${errors.slice(0, 5).join(" ")}${more}`);
  }
  return records;
}

export function deduplicate(existing, incoming, type) {
  const keyFor = {
    invoices: (item) => `${normalizeHeader(item.clientName)}|${normalizeHeader(item.invoiceNumber)}`,
    payments: (item) => `${normalizeHeader(item.clientName)}|${normalizeHeader(item.invoiceNumber)}|${item.paymentDate}|${item.amount}`,
    timeEntries: (item) => `${normalizeHeader(item.clientName)}|${item.date}|${item.hours}|${normalizeHeader(item.description)}`
  }[type];
  const keys = new Set(existing.map(keyFor));
  const unique = incoming.filter((item) => {
    const key = keyFor(item);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
  return { records: [...existing, ...unique], added: unique.length, skipped: incoming.length - unique.length };
}

export function extractContractCandidates(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const first = (patterns) => {
    for (const pattern of patterns) {
      const match = clean.match(pattern);
      if (match) return match[1].trim();
    }
    return "";
  };
  const money = (patterns) => parseMoney(first(patterns));
  const number = (patterns) => parseNumber(first(patterns));
  const date = (patterns) => isoDate(first(patterns));
  const clientName = first([
    /(?:client|customer)\s*(?:name)?\s*[:\-]\s*([A-Za-z0-9&.,' -]{2,80}?)(?=\s{2,}| agreement| effective| start|$)/i,
    /agreement\s+between\s+.+?\s+and\s+([A-Za-z0-9&.,' -]{2,80}?)(?=\.|,|\s+effective)/i
  ]);
  return {
    clientName,
    hourlyRate: money([/(?:hourly|billing)\s+rate\s*[:\-]?\s*\$?([\d,.]+)/i, /\$([\d,.]+)\s*(?:per|\/)\s*hour/i]),
    retainerAmount: money([/(?:monthly\s+)?retainer\s*[:\-]?\s*\$?([\d,.]+)/i]),
    includedHours: number([/(?:includes?|included)\s+([\d.]+)\s+hours/i, /included\s+hours\s*[:\-]?\s*([\d.]+)/i]),
    paymentTermsDays: number([/net\s+(\d{1,3})/i, /payment\s+(?:is\s+)?due\s+(?:within\s+)?(\d{1,3})\s+days/i]),
    annualIncreasePercent: number([/(?:annual|yearly)\s+(?:price\s+)?increase\s*[:\-]?\s*([\d.]+)\s*%/i, /increase(?:d|s)?\s+(?:annually\s+)?by\s+([\d.]+)\s*%/i]),
    startDate: date([/(?:effective|start)\s+date\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i]),
    endDate: date([/(?:expiration|expiry|end|renewal)\s+date\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i])
  };
}

function formatCurrency(value, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(Math.round((value + Number.EPSILON) * 100) / 100);
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function finding({ category, clientName, amount = null, severity, confidence, title, explanation, evidence, action, status = "complete" }) {
  return {
    id: uid("finding"),
    category,
    clientName,
    amount: amount === null ? null : roundMoney(amount),
    severity,
    confidence,
    title,
    explanation,
    evidence,
    action,
    status
  };
}

export function analyzeAudit(audit, today = relativeDate(0)) {
  const findings = [];
  const currency = (value) => formatCurrency(value, audit.currency || "USD");
  const clients = new Set([
    ...(audit.clients || []).map((item) => item.name),
    ...(audit.contracts || []).map((item) => item.clientName),
    ...(audit.invoices || []).map((item) => item.clientName),
    ...(audit.timeEntries || []).map((item) => item.clientName)
  ].filter(Boolean));
  const contractFor = (name) => (audit.contracts || []).find(
    (contract) => contract.confirmed && normalizeHeader(contract.clientName) === normalizeHeader(name)
  );
  const invoicesFor = (name) => (audit.invoices || []).filter(
    (invoice) => normalizeHeader(invoice.clientName) === normalizeHeader(name)
  );
  const timeFor = (name) => (audit.timeEntries || []).filter(
    (entry) => normalizeHeader(entry.clientName) === normalizeHeader(name)
  );

  clients.forEach((clientName) => {
    const contract = contractFor(clientName);
    const invoices = invoicesFor(clientName);
    const entries = timeFor(clientName);
    const billableUninvoiced = entries.filter((entry) => entry.billable && !entry.invoiced && !entry.invoiceNumber);
    const unbilledHours = billableUninvoiced.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);

    if (unbilledHours > 0) {
      if (contract?.hourlyRate) {
        const amount = unbilledHours * contract.hourlyRate;
        findings.push(finding({
          category: "unbilled",
          clientName,
          amount,
          severity: amount >= 5000 ? "critical" : "high",
          confidence: "high",
          title: `${unbilledHours.toFixed(1)} billable hours are not tied to an invoice`,
          explanation: `${unbilledHours.toFixed(1)} uninvoiced hours × ${currency(contract.hourlyRate)} confirmed hourly rate = ${currency(amount)}.`,
          evidence: `${billableUninvoiced.length} time entries; confirmed contract rate of ${currency(contract.hourlyRate)}.`,
          action: "Review these time entries and prepare a catch-up invoice."
        }));
      } else {
        findings.push(finding({
          category: "unbilled",
          clientName,
          severity: "medium",
          confidence: "incomplete",
          title: `${unbilledHours.toFixed(1)} billable hours may be unbilled`,
          explanation: "The hours are identifiable, but no confirmed hourly rate is available, so no dollar estimate was calculated.",
          evidence: `${billableUninvoiced.length} time entries without an invoice number.`,
          action: "Confirm the contract rate to calculate the recoverable amount.",
          status: "incomplete"
        }));
      }
    }

    if (contract?.hourlyRate) {
      invoices.filter((invoice) => invoice.hours > 0).forEach((invoice) => {
        const expected = invoice.hours * contract.hourlyRate;
        const shortfall = expected - Number(invoice.amount || 0);
        if (shortfall > 0.01) {
          findings.push(finding({
            category: "underbilling",
            clientName,
            amount: shortfall,
            severity: shortfall >= 2500 ? "high" : "medium",
            confidence: "high",
            title: `Invoice ${invoice.invoiceNumber} is below the confirmed contract rate`,
            explanation: `${invoice.hours} hours × ${currency(contract.hourlyRate)} = ${currency(expected)}, but the invoice is ${currency(invoice.amount)}.`,
            evidence: `Invoice ${invoice.invoiceNumber} dated ${invoice.invoiceDate}; confirmed hourly rate.`,
            action: "Check for discounts or credits, then issue an adjustment if the shortfall is unintended."
          }));
        }
      });
    }

    if (contract?.retainerAmount) {
      const latestMonth = invoices.map((item) => item.invoiceDate).filter(Boolean).sort().at(-1)?.slice(0, 7);
      if (latestMonth) {
        const billed = invoices.filter((item) => item.invoiceDate.startsWith(latestMonth))
          .reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const shortfall = contract.retainerAmount - billed;
        if (shortfall > 0.01) {
          findings.push(finding({
            category: "retainer",
            clientName,
            amount: shortfall,
            severity: "high",
            confidence: "medium",
            title: `Latest monthly billing is below the confirmed retainer`,
            explanation: `${currency(contract.retainerAmount)} monthly retainer − ${currency(billed)} billed in ${latestMonth} = ${currency(shortfall)}.`,
            evidence: `Confirmed retainer and ${invoices.filter((item) => item.invoiceDate.startsWith(latestMonth)).length} invoice(s) in ${latestMonth}.`,
            action: "Confirm the billing period and issue the remaining retainer invoice if appropriate."
          }));
        }
      } else {
        findings.push(finding({
          category: "retainer",
          clientName,
          amount: contract.retainerAmount,
          severity: "high",
          confidence: "medium",
          title: "No invoice was found for the confirmed retainer",
          explanation: `The confirmed monthly retainer is ${currency(contract.retainerAmount)}, but no invoice dates are available.`,
          evidence: "Confirmed retainer; no dated invoices for this client.",
          action: "Verify the current billing period and create the missing invoice if needed."
        }));
      }
    }

    if (contract?.annualIncreasePercent && contract?.startDate && daysBetween(contract.startDate, today) >= 365) {
      const latest = [...invoices].filter((item) => item.rate).sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))[0];
      if (latest && contract.hourlyRate && latest.rate <= contract.hourlyRate) {
        const expectedRate = contract.hourlyRate * (1 + contract.annualIncreasePercent / 100);
        const affectedHours = invoices
          .filter((item) => item.invoiceDate >= addDays(contract.startDate, 365))
          .reduce((sum, item) => sum + Number(item.hours || 0), 0);
        const amount = affectedHours > 0 ? (expectedRate - latest.rate) * affectedHours : 0;
        findings.push(finding({
          category: "increase",
          clientName,
          amount,
          severity: amount >= 2500 ? "high" : "medium",
          confidence: "medium",
          title: `A ${contract.annualIncreasePercent}% annual increase may not have been applied`,
          explanation: `The latest billed rate is ${currency(latest.rate)}; one confirmed increase would make the rate ${currency(expectedRate)}.${affectedHours ? ` The estimate applies the difference to ${affectedHours} billed hours.` : ""}`,
          evidence: `Contract start ${contract.startDate}; latest invoice rate ${currency(latest.rate)}.`,
          action: "Confirm the increase effective date and notify the client before adjusting future billing."
        }));
      }
    }

    if (contract?.endDate) {
      const remaining = daysBetween(today, contract.endDate);
      if (remaining !== null && remaining >= 0 && remaining <= 90) {
        findings.push(finding({
          category: "renewal",
          clientName,
          amount: contract.retainerAmount || null,
          severity: remaining <= 30 ? "high" : "medium",
          confidence: "high",
          title: `Contract ${remaining === 0 ? "renews or expires today" : `renews or expires in ${remaining} days`}`,
          explanation: `The confirmed contract date is ${contract.endDate}.`,
          evidence: `Confirmed renewal/expiration date from ${contract.sourceName || "contract terms"}.`,
          action: "Start the renewal conversation and confirm scope, pricing, and next-term dates."
        }));
      }
    }

    if (contract?.includedHours && contract?.hourlyRate) {
      const hoursByMonth = entries.filter((entry) => entry.billable).reduce((groups, entry) => {
        const month = entry.date.slice(0, 7);
        groups[month] = (groups[month] || 0) + Number(entry.hours || 0);
        return groups;
      }, {});
      Object.entries(hoursByMonth).forEach(([month, hours]) => {
        const threshold = contract.includedHours * 1.2;
        if (hours > threshold) {
          const excess = hours - contract.includedHours;
          findings.push(finding({
            category: "scope",
            clientName,
            amount: excess * contract.hourlyRate,
            severity: "high",
            confidence: "medium",
            title: `Work exceeded included hours by ${excess.toFixed(1)} hours in ${month}`,
            explanation: `${hours.toFixed(1)} billable hours exceeded ${contract.includedHours} confirmed included hours. At ${currency(contract.hourlyRate)}/hour, ${currency(excess * contract.hourlyRate)} is at risk.`,
            evidence: `Billable time entries in ${month}; confirmed included-hours allowance.`,
            action: "Review scope with the client and approve an overage invoice or change order."
          }));
        }
      });
    }
  });

  (audit.invoices || []).forEach((invoice) => {
    const contract = contractFor(invoice.clientName);
    const dueDate = invoice.dueDate || (contract?.paymentTermsDays ? addDays(invoice.invoiceDate, contract.paymentTermsDays) : "");
    if (!dueDate || daysBetween(dueDate, today) <= 0) return;
    const paid = (audit.payments || [])
      .filter((payment) => normalizeHeader(payment.invoiceNumber) === normalizeHeader(invoice.invoiceNumber)
        && normalizeHeader(payment.clientName) === normalizeHeader(invoice.clientName))
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const balance = Number(invoice.amount || 0) - paid;
    if (balance > 0.01) {
      const overdueDays = daysBetween(dueDate, today);
      findings.push(finding({
        category: "overdue",
        clientName: invoice.clientName,
        amount: balance,
        severity: overdueDays >= 60 ? "critical" : overdueDays >= 30 ? "high" : "medium",
        confidence: "high",
        title: `Invoice ${invoice.invoiceNumber} is ${overdueDays} days overdue`,
        explanation: `${currency(invoice.amount)} invoiced − ${currency(paid)} in matched payments = ${currency(balance)} outstanding.`,
        evidence: `Due ${dueDate}; payments matched by client and invoice number.`,
        action: "Verify the payment ledger, then send a documented payment reminder."
      }));
    }
  });

  return findings.sort((a, b) => (b.amount || 0) - (a.amount || 0));
}

export function summarizeFindings(findings) {
  const complete = findings.filter((item) => item.status !== "incomplete");
  return {
    recoverable: roundMoney(complete.filter((item) => ["unbilled", "underbilling", "retainer", "increase"].includes(item.category))
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)),
    overdue: roundMoney(complete.filter((item) => item.category === "overdue")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)),
    renewalRisk: roundMoney(complete.filter((item) => ["renewal", "scope"].includes(item.category))
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)),
    severity: findings.reduce((counts, item) => {
      counts[item.severity] = (counts[item.severity] || 0) + 1;
      return counts;
    }, {})
  };
}

function relativeDate(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function createDemoAudit() {
  const month = relativeDate(-20).slice(0, 7);
  return {
    id: "demo-audit",
    schemaVersion: SCHEMA_VERSION,
    name: "Northstar Studio — demo",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true,
    currency: "USD",
    clients: [
      { id: "client-acme", name: "Acme Health" },
      { id: "client-cedar", name: "Cedar & Co." },
      { id: "client-north", name: "Northline Labs" }
    ],
    contracts: [
      {
        id: "contract-acme", clientName: "Acme Health", hourlyRate: 200, retainerAmount: 8000,
        includedHours: 40, paymentTermsDays: 30, annualIncreasePercent: 5,
        startDate: relativeDate(-500), endDate: relativeDate(42), confirmed: true, sourceName: "Acme MSA.pdf"
      },
      {
        id: "contract-cedar", clientName: "Cedar & Co.", hourlyRate: 175, retainerAmount: null,
        includedHours: 30, paymentTermsDays: 15, annualIncreasePercent: 0,
        startDate: relativeDate(-200), endDate: relativeDate(180), confirmed: true, sourceName: "Cedar SOW.pdf"
      },
      {
        id: "contract-north", clientName: "Northline Labs", hourlyRate: null, retainerAmount: 4500,
        includedHours: null, paymentTermsDays: 30, annualIncreasePercent: 0,
        startDate: relativeDate(-90), endDate: relativeDate(275), confirmed: true, sourceName: "Northline retainer.pdf"
      }
    ],
    invoices: [
      { id: "inv-1", clientName: "Acme Health", invoiceNumber: "AH-1042", invoiceDate: relativeDate(-70), dueDate: relativeDate(-40), amount: 6500, hours: 35, rate: 185, status: "sent" },
      { id: "inv-2", clientName: "Acme Health", invoiceNumber: "AH-1051", invoiceDate: `${month}-05`, dueDate: `${month}-25`, amount: 6000, hours: 30, rate: 200, status: "sent" },
      { id: "inv-3", clientName: "Cedar & Co.", invoiceNumber: "CC-220", invoiceDate: relativeDate(-50), dueDate: relativeDate(-35), amount: 4200, hours: 24, rate: 175, status: "partial" }
    ],
    payments: [
      { id: "pay-1", clientName: "Acme Health", invoiceNumber: "AH-1042", paymentDate: relativeDate(-38), amount: 3000 },
      { id: "pay-2", clientName: "Cedar & Co.", invoiceNumber: "CC-220", paymentDate: relativeDate(-30), amount: 2000 }
    ],
    timeEntries: [
      { id: "time-1", clientName: "Acme Health", date: `${month}-02`, hours: 28, billable: true, invoiced: true, invoiceNumber: "AH-1051", description: "Campaign strategy" },
      { id: "time-2", clientName: "Acme Health", date: `${month}-12`, hours: 24, billable: true, invoiced: false, invoiceNumber: "", description: "Launch support" },
      { id: "time-3", clientName: "Cedar & Co.", date: `${month}-08`, hours: 38, billable: true, invoiced: true, invoiceNumber: "CC-220", description: "Product design" },
      { id: "time-4", clientName: "Cedar & Co.", date: `${month}-18`, hours: 6, billable: true, invoiced: false, invoiceNumber: "", description: "Research synthesis" },
      { id: "time-5", clientName: "Northline Labs", date: `${month}-10`, hours: 12, billable: true, invoiced: false, invoiceNumber: "", description: "Advisory session" }
    ],
    findings: []
  };
}

export function createEmptyAudit(name) {
  const now = new Date().toISOString();
  return {
    id: uid("audit"),
    schemaVersion: SCHEMA_VERSION,
    name: String(name || "Untitled audit").trim(),
    currency: "USD",
    createdAt: now,
    updatedAt: now,
    isDemo: false,
    clients: [],
    contracts: [],
    invoices: [],
    payments: [],
    timeEntries: [],
    findings: []
  };
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
