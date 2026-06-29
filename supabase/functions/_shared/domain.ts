export const ENGINE_VERSION = "2.0.0";
export const SCHEMA_VERSION = 2;

export type PlanCode = "free" | "solo" | "team";
export type WorkspaceType = "personal" | "business";
export type WorkspaceRole = "owner" | "admin" | "analyst" | "viewer";
export type FindingSeverity = "critical" | "high" | "medium";
export type FindingConfidence = "high" | "medium" | "incomplete";
export type FindingCategory =
  | "unbilled"
  | "underbilling"
  | "retainer"
  | "overdue"
  | "increase"
  | "renewal"
  | "scope";

export interface PlanEntitlement {
  code: PlanCode;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  seats: number;
  clients: number;
  activeAudits: number;
  storageBytes: number;
  integrations: boolean;
  scheduledAudits: boolean;
  businessWorkspace: boolean;
}

export const PLAN_ENTITLEMENTS: Record<PlanCode, PlanEntitlement> = {
  free: {
    code: "free",
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    seats: 1,
    clients: 3,
    activeAudits: 1,
    storageBytes: 50 * 1024 * 1024,
    integrations: false,
    scheduledAudits: false,
    businessWorkspace: false,
  },
  solo: {
    code: "solo",
    name: "Solo",
    monthlyPrice: 39,
    annualPrice: 390,
    seats: 1,
    clients: 25,
    activeAudits: 25,
    storageBytes: 1024 * 1024 * 1024,
    integrations: true,
    scheduledAudits: true,
    businessWorkspace: false,
  },
  team: {
    code: "team",
    name: "Team",
    monthlyPrice: 129,
    annualPrice: 1290,
    seats: 5,
    clients: 100,
    activeAudits: 100,
    storageBytes: 5 * 1024 * 1024 * 1024,
    integrations: true,
    scheduledAudits: true,
    businessWorkspace: true,
  },
};

export interface ClientRecord {
  id: string;
  name: string;
  externalId?: string | null;
}

export interface ContractRecord {
  id: string;
  clientId?: string | null;
  clientName: string;
  hourlyRate: number | null;
  retainerAmount: number | null;
  includedHours: number | null;
  paymentTermsDays: number | null;
  annualIncreasePercent: number | null;
  startDate: string;
  endDate: string;
  confirmed: boolean;
  sourceName?: string;
}

export interface InvoiceRecord {
  id: string;
  clientId?: string | null;
  clientName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  hours: number | null;
  rate: number | null;
  status?: string;
  externalId?: string | null;
  source?: string;
}

export interface PaymentRecord {
  id: string;
  clientId?: string | null;
  clientName: string;
  invoiceNumber: string;
  paymentDate: string;
  amount: number;
  externalId?: string | null;
  source?: string;
}

export interface TimeEntryRecord {
  id: string;
  clientId?: string | null;
  clientName: string;
  date: string;
  hours: number;
  billable: boolean;
  invoiced: boolean;
  invoiceNumber: string;
  description?: string;
  externalId?: string | null;
  source?: string;
}

export interface AuditInput {
  id?: string;
  currency: string;
  clients: ClientRecord[];
  contracts: ContractRecord[];
  invoices: InvoiceRecord[];
  payments: PaymentRecord[];
  timeEntries: TimeEntryRecord[];
}

export interface Finding {
  id: string;
  category: FindingCategory;
  clientName: string;
  amount: number | null;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  title: string;
  explanation: string;
  evidence: string;
  action: string;
  status: "complete" | "incomplete";
}

export interface FindingSummary {
  recoverable: number;
  overdue: number;
  renewalRisk: number;
  severity: Partial<Record<FindingSeverity, number>>;
}

export function normalizeName(value = ""): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function localIsoDate(date = new Date()): string {
  return `${date.getFullYear()}-${
    String(date.getMonth() + 1).padStart(2, "0")
  }-${String(date.getDate()).padStart(2, "0")}`;
}

export function isoDate(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (direct) {
    const [, year, month, day] = direct;
    const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
    return date.getFullYear() === Number(year) &&
        date.getMonth() + 1 === Number(month) &&
        date.getDate() === Number(day)
      ? raw
      : "";
  }
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!slash) return "";
  const [, month, day, year] = slash;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
  return date.getFullYear() === Number(year) &&
      date.getMonth() + 1 === Number(month) &&
      date.getDate() === Number(day)
    ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
    : "";
}

export function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

export function daysBetween(from: string, to: string): number | null {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    roundMoney(value),
  );
}

function uid(prefix: string): string {
  return `${prefix}-${
    globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }`;
}

function makeFinding(
  input: Omit<Finding, "id" | "status"> & { status?: Finding["status"] },
): Finding {
  return {
    ...input,
    id: uid("finding"),
    amount: input.amount === null ? null : roundMoney(input.amount),
    status: input.status ?? "complete",
  };
}

export function analyzeAudit(
  audit: AuditInput,
  today = localIsoDate(),
): Finding[] {
  const findings: Finding[] = [];
  const currency = (value: number) =>
    formatCurrency(value, audit.currency || "USD");
  const clientNames = new Set([
    ...audit.clients.map((record) => record.name),
    ...audit.contracts.map((record) => record.clientName),
    ...audit.invoices.map((record) => record.clientName),
    ...audit.timeEntries.map((record) => record.clientName),
  ].filter(Boolean));
  const contractFor = (name: string) =>
    audit.contracts.find(
      (record) =>
        record.confirmed &&
        normalizeName(record.clientName) === normalizeName(name),
    );
  const invoicesFor = (name: string) =>
    audit.invoices.filter(
      (record) => normalizeName(record.clientName) === normalizeName(name),
    );
  const entriesFor = (name: string) =>
    audit.timeEntries.filter(
      (record) => normalizeName(record.clientName) === normalizeName(name),
    );

  for (const clientName of clientNames) {
    const contract = contractFor(clientName);
    const invoices = invoicesFor(clientName);
    const entries = entriesFor(clientName);
    const unbilledEntries = entries.filter((entry) =>
      entry.billable && !entry.invoiced && !entry.invoiceNumber
    );
    const unbilledHours = unbilledEntries.reduce(
      (sum, entry) => sum + entry.hours,
      0,
    );

    if (unbilledHours > 0) {
      if (contract?.hourlyRate) {
        const amount = unbilledHours * contract.hourlyRate;
        findings.push(makeFinding({
          category: "unbilled",
          clientName,
          amount,
          severity: amount >= 5_000 ? "critical" : "high",
          confidence: "high",
          title: `${
            unbilledHours.toFixed(1)
          } billable hours are not tied to an invoice`,
          explanation: `${unbilledHours.toFixed(1)} uninvoiced hours × ${
            currency(contract.hourlyRate)
          } confirmed rate = ${currency(amount)}.`,
          evidence:
            `${unbilledEntries.length} time entries and a human-confirmed contract rate.`,
          action: "Review the entries and prepare a catch-up invoice.",
        }));
      } else {
        findings.push(makeFinding({
          category: "unbilled",
          clientName,
          amount: null,
          severity: "medium",
          confidence: "incomplete",
          title: `${unbilledHours.toFixed(1)} billable hours may be unbilled`,
          explanation:
            "The hours are identifiable, but no confirmed rate is available, so no amount was invented.",
          evidence:
            `${unbilledEntries.length} billable entries without an invoice reference.`,
          action:
            "Confirm the contract rate to calculate the recoverable amount.",
          status: "incomplete",
        }));
      }
    }

    if (contract?.hourlyRate) {
      for (
        const invoice of invoices.filter((record) => Number(record.hours) > 0)
      ) {
        const expected = Number(invoice.hours) * contract.hourlyRate;
        const shortfall = expected - invoice.amount;
        if (shortfall > 0.01) {
          findings.push(makeFinding({
            category: "underbilling",
            clientName,
            amount: shortfall,
            severity: shortfall >= 2_500 ? "high" : "medium",
            confidence: "high",
            title:
              `Invoice ${invoice.invoiceNumber} is below the confirmed rate`,
            explanation: `${invoice.hours} hours × ${
              currency(contract.hourlyRate)
            } = ${currency(expected)}, versus ${
              currency(invoice.amount)
            } invoiced.`,
            evidence:
              `Invoice ${invoice.invoiceNumber} dated ${invoice.invoiceDate} and the confirmed contract rate.`,
            action:
              "Check for an approved discount, then issue an adjustment if unintended.",
          }));
        }
      }
    }

    if (contract?.retainerAmount) {
      const latestMonth = invoices.map((record) => record.invoiceDate).filter(
        Boolean,
      ).sort().at(-1)?.slice(0, 7);
      const billed = latestMonth
        ? invoices.filter((record) =>
          record.invoiceDate.startsWith(latestMonth)
        ).reduce((sum, record) => sum + record.amount, 0)
        : 0;
      const shortfall = contract.retainerAmount - billed;
      if (shortfall > 0.01) {
        findings.push(makeFinding({
          category: "retainer",
          clientName,
          amount: shortfall,
          severity: "high",
          confidence: "medium",
          title: latestMonth
            ? "Latest monthly billing is below the retainer"
            : "No invoice was found for the retainer",
          explanation: `${
            currency(contract.retainerAmount)
          } confirmed retainer − ${currency(billed)} found in ${
            latestMonth ?? "dated invoices"
          } = ${currency(shortfall)}.`,
          evidence:
            "Human-confirmed retainer terms and imported invoice dates.",
          action:
            "Verify the billing period and invoice any valid remaining retainer.",
        }));
      }
    }

    if (
      contract?.annualIncreasePercent && contract.startDate &&
      daysBetween(contract.startDate, today)! >= 365
    ) {
      const latest = [...invoices].filter((record) =>
        record.rate
      ).sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))[0];
      if (
        latest?.rate && contract.hourlyRate &&
        latest.rate <= contract.hourlyRate
      ) {
        const expectedRate = contract.hourlyRate *
          (1 + contract.annualIncreasePercent / 100);
        const affectedHours = invoices.filter((record) =>
          record.invoiceDate >= addDays(contract.startDate, 365)
        )
          .reduce((sum, record) =>
            sum + Number(record.hours || 0), 0);
        const amount = (expectedRate - latest.rate) * affectedHours;
        findings.push(makeFinding({
          category: "increase",
          clientName,
          amount,
          severity: amount >= 2_500 ? "high" : "medium",
          confidence: "medium",
          title:
            `A ${contract.annualIncreasePercent}% annual increase may not have been applied`,
          explanation: `Latest rate ${currency(latest.rate)} versus ${
            currency(expectedRate)
          } after one confirmed increase, across ${affectedHours} billed hours.`,
          evidence:
            `Contract start ${contract.startDate} and latest imported invoice rate.`,
          action:
            "Confirm the effective date before correcting future or past billing.",
        }));
      }
    }

    if (contract?.endDate) {
      const remaining = daysBetween(today, contract.endDate);
      if (remaining !== null && remaining >= 0 && remaining <= 90) {
        findings.push(makeFinding({
          category: "renewal",
          clientName,
          amount: contract.retainerAmount,
          severity: remaining <= 30 ? "high" : "medium",
          confidence: "high",
          title: `Contract renews or expires in ${remaining} days`,
          explanation:
            `The human-confirmed contract date is ${contract.endDate}.`,
          evidence: `Confirmed date from ${
            contract.sourceName || "contract terms"
          }.`,
          action:
            "Start the renewal conversation and confirm next-term scope and pricing.",
        }));
      }
    }

    if (contract?.includedHours && contract.hourlyRate) {
      const monthlyHours = entries.filter((entry) => entry.billable).reduce<
        Record<string, number>
      >((groups, entry) => {
        const month = entry.date.slice(0, 7);
        groups[month] = (groups[month] || 0) + entry.hours;
        return groups;
      }, {});
      for (const [month, hours] of Object.entries(monthlyHours)) {
        if (hours > contract.includedHours * 1.2) {
          const excess = hours - contract.includedHours;
          findings.push(makeFinding({
            category: "scope",
            clientName,
            amount: excess * contract.hourlyRate,
            severity: "high",
            confidence: "medium",
            title: `Work exceeded included hours by ${
              excess.toFixed(1)
            } in ${month}`,
            explanation: `${
              hours.toFixed(1)
            } billable hours exceeded ${contract.includedHours} included hours; ${
              currency(excess * contract.hourlyRate)
            } is at risk.`,
            evidence:
              `Imported monthly time entries and confirmed included-hours terms.`,
            action:
              "Approve an overage invoice or change order with the client.",
          }));
        }
      }
    }
  }

  for (const invoice of audit.invoices) {
    const contract = contractFor(invoice.clientName);
    const dueDate = invoice.dueDate ||
      (contract?.paymentTermsDays
        ? addDays(invoice.invoiceDate, contract.paymentTermsDays)
        : "");
    const overdueDays = dueDate ? daysBetween(dueDate, today) : null;
    if (overdueDays === null || overdueDays <= 0) continue;
    const paid = audit.payments.filter(
      (payment) =>
        normalizeName(payment.invoiceNumber) ===
          normalizeName(invoice.invoiceNumber) &&
        normalizeName(payment.clientName) === normalizeName(invoice.clientName),
    ).reduce((sum, payment) => sum + payment.amount, 0);
    const balance = invoice.amount - paid;
    if (balance > 0.01) {
      findings.push(makeFinding({
        category: "overdue",
        clientName: invoice.clientName,
        amount: balance,
        severity: overdueDays >= 60
          ? "critical"
          : overdueDays >= 30
          ? "high"
          : "medium",
        confidence: "high",
        title:
          `Invoice ${invoice.invoiceNumber} is ${overdueDays} days overdue`,
        explanation: `${currency(invoice.amount)} invoiced − ${
          currency(paid)
        } matched payments = ${currency(balance)} outstanding.`,
        evidence:
          `Due ${dueDate}; payments matched by workspace, client, and invoice number.`,
        action: "Verify the ledger, then send a documented payment reminder.",
      }));
    }
  }

  return findings.sort((a, b) => (b.amount || 0) - (a.amount || 0));
}

export function summarizeFindings(findings: Finding[]): FindingSummary {
  const complete = findings.filter((finding) => finding.status === "complete");
  return {
    recoverable: roundMoney(
      complete.filter((finding) =>
        ["unbilled", "underbilling", "retainer", "increase"].includes(
          finding.category,
        )
      )
        .reduce((sum, finding) => sum + Number(finding.amount || 0), 0),
    ),
    overdue: roundMoney(
      complete.filter((finding) => finding.category === "overdue")
        .reduce((sum, finding) => sum + Number(finding.amount || 0), 0),
    ),
    renewalRisk: roundMoney(
      complete.filter((finding) =>
        ["renewal", "scope"].includes(finding.category)
      )
        .reduce((sum, finding) => sum + Number(finding.amount || 0), 0),
    ),
    severity: findings.reduce<FindingSummary["severity"]>((counts, finding) => {
      counts[finding.severity] = (counts[finding.severity] || 0) + 1;
      return counts;
    }, {}),
  };
}

export function entitlementFor(
  plan: string | null | undefined,
): PlanEntitlement {
  return PLAN_ENTITLEMENTS[
    (plan && plan in PLAN_ENTITLEMENTS ? plan : "free") as PlanCode
  ];
}

export function canCreateResource(
  plan: PlanCode,
  resource: "seat" | "client" | "audit" | "storage",
  currentUsage: number,
  increment = 1,
): boolean {
  const entitlement = PLAN_ENTITLEMENTS[plan];
  const limit = resource === "seat"
    ? entitlement.seats
    : resource === "client"
    ? entitlement.clients
    : resource === "audit"
    ? entitlement.activeAudits
    : entitlement.storageBytes;
  return currentUsage + increment <= limit;
}
