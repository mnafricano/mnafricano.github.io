import { describe, expect, it } from "vitest";
import {
  PLAN_ENTITLEMENTS,
  addDays,
  analyzeAudit,
  canCreateResource,
  entitlementFor,
  isoDate,
  summarizeFindings,
  type AuditInput,
} from "../../../../supabase/functions/_shared/domain";

function fixture(): AuditInput {
  return {
    currency: "USD",
    clients: [
      { id: "c1", name: "Acme" },
      { id: "c2", name: "No Rate LLC" },
    ],
    contracts: [
      {
        id: "co1",
        clientName: "Acme",
        hourlyRate: 200,
        retainerAmount: 8_000,
        includedHours: 40,
        paymentTermsDays: 30,
        annualIncreasePercent: 5,
        startDate: "2024-01-01",
        endDate: "2026-07-15",
        confirmed: true,
      },
      {
        id: "co2",
        clientName: "No Rate LLC",
        hourlyRate: null,
        retainerAmount: null,
        includedHours: null,
        paymentTermsDays: 30,
        annualIncreasePercent: null,
        startDate: "2026-01-01",
        endDate: "2027-01-01",
        confirmed: true,
      },
    ],
    invoices: [
      {
        id: "i1",
        clientName: "Acme",
        invoiceNumber: "A-1",
        invoiceDate: "2026-05-01",
        dueDate: "2026-05-31",
        amount: 6_000,
        hours: 35,
        rate: 180,
      },
      {
        id: "i2",
        clientName: "Acme",
        invoiceNumber: "A-2",
        invoiceDate: "2026-06-01",
        dueDate: "2026-06-15",
        amount: 6_000,
        hours: 30,
        rate: 200,
      },
    ],
    payments: [
      {
        id: "p1",
        clientName: "Acme",
        invoiceNumber: "A-1",
        paymentDate: "2026-06-05",
        amount: 2_000,
      },
    ],
    timeEntries: [
      {
        id: "t1",
        clientName: "Acme",
        date: "2026-06-02",
        hours: 50,
        billable: true,
        invoiced: true,
        invoiceNumber: "A-2",
      },
      {
        id: "t2",
        clientName: "Acme",
        date: "2026-06-20",
        hours: 5,
        billable: true,
        invoiced: false,
        invoiceNumber: "",
      },
      {
        id: "t3",
        clientName: "No Rate LLC",
        date: "2026-06-20",
        hours: 3,
        billable: true,
        invoiced: false,
        invoiceNumber: "",
      },
    ],
  };
}

describe("shared audit domain", () => {
  it("covers every disclosed detection rule", () => {
    const findings = analyzeAudit(fixture(), "2026-06-28");
    const categories = new Set(findings.map((finding) => finding.category));
    expect(categories).toEqual(
      new Set([
        "unbilled",
        "underbilling",
        "retainer",
        "increase",
        "renewal",
        "scope",
        "overdue",
      ]),
    );
    expect(
      findings.find((finding) => finding.clientName === "No Rate LLC")?.amount,
    ).toBeNull();
  });

  it("reconciles partial payments and separates summary buckets", () => {
    const findings = analyzeAudit(fixture(), "2026-06-28");
    expect(
      findings.find(
        (finding) =>
          finding.title.includes("A-1") && finding.category === "overdue",
      )?.amount,
    ).toBe(4_000);
    const summary = summarizeFindings(findings);
    expect(summary.recoverable).toBeGreaterThan(0);
    expect(summary.overdue).toBeGreaterThan(0);
    expect(summary.renewalRisk).toBeGreaterThan(0);
  });

  it("validates dates without rollover", () => {
    expect(isoDate("06/28/2026")).toBe("2026-06-28");
    expect(isoDate("2026-02-31")).toBe("");
    expect(addDays("2026-01-30", 5)).toBe("2026-02-04");
  });

  it("enforces exact plan limits", () => {
    expect(entitlementFor("unknown")).toEqual(PLAN_ENTITLEMENTS.free);
    expect(canCreateResource("free", "client", 2)).toBe(true);
    expect(canCreateResource("free", "client", 3)).toBe(false);
    expect(canCreateResource("team", "seat", 4)).toBe(true);
    expect(canCreateResource("team", "seat", 5)).toBe(false);
  });
});
