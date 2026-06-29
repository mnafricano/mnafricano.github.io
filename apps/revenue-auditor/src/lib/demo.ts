import {
  analyzeAudit,
  localIsoDate,
  type AuditInput,
  type Finding,
} from "../../../../supabase/functions/_shared/domain";
import type { AuditDetail } from "../types";

function relative(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

export function createDemoAudit(): AuditDetail {
  const month = relative(-10).slice(0, 7);
  const input: AuditInput = {
    id: "demo",
    currency: "USD",
    clients: [
      { id: "acme", name: "Acme Health" },
      { id: "cedar", name: "Cedar & Co." },
      { id: "north", name: "Northline Labs" },
    ],
    contracts: [
      {
        id: "contract-acme",
        clientName: "Acme Health",
        hourlyRate: 200,
        retainerAmount: 8_000,
        includedHours: 40,
        paymentTermsDays: 30,
        annualIncreasePercent: 5,
        startDate: relative(-500),
        endDate: relative(42),
        confirmed: true,
        sourceName: "Acme MSA.pdf",
      },
      {
        id: "contract-cedar",
        clientName: "Cedar & Co.",
        hourlyRate: 175,
        retainerAmount: null,
        includedHours: 30,
        paymentTermsDays: 15,
        annualIncreasePercent: null,
        startDate: relative(-200),
        endDate: relative(180),
        confirmed: true,
        sourceName: "Cedar SOW.pdf",
      },
      {
        id: "contract-north",
        clientName: "Northline Labs",
        hourlyRate: null,
        retainerAmount: 4_500,
        includedHours: null,
        paymentTermsDays: 30,
        annualIncreasePercent: null,
        startDate: relative(-90),
        endDate: relative(275),
        confirmed: true,
        sourceName: "Northline Retainer.pdf",
      },
    ],
    invoices: [
      {
        id: "i1",
        clientName: "Acme Health",
        invoiceNumber: "AH-1042",
        invoiceDate: relative(-70),
        dueDate: relative(-40),
        amount: 6_500,
        hours: 35,
        rate: 185,
        status: "open",
      },
      {
        id: "i2",
        clientName: "Acme Health",
        invoiceNumber: "AH-1051",
        invoiceDate: `${month}-05`,
        dueDate: `${month}-25`,
        amount: 6_000,
        hours: 30,
        rate: 200,
        status: "open",
      },
      {
        id: "i3",
        clientName: "Cedar & Co.",
        invoiceNumber: "CC-220",
        invoiceDate: relative(-50),
        dueDate: relative(-35),
        amount: 4_200,
        hours: 24,
        rate: 175,
        status: "partial",
      },
    ],
    payments: [
      {
        id: "p1",
        clientName: "Acme Health",
        invoiceNumber: "AH-1042",
        paymentDate: relative(-38),
        amount: 3_000,
      },
      {
        id: "p2",
        clientName: "Cedar & Co.",
        invoiceNumber: "CC-220",
        paymentDate: relative(-30),
        amount: 2_000,
      },
    ],
    timeEntries: [
      {
        id: "t1",
        clientName: "Acme Health",
        date: `${month}-02`,
        hours: 28,
        billable: true,
        invoiced: true,
        invoiceNumber: "AH-1051",
      },
      {
        id: "t2",
        clientName: "Acme Health",
        date: `${month}-12`,
        hours: 24,
        billable: true,
        invoiced: false,
        invoiceNumber: "",
      },
      {
        id: "t3",
        clientName: "Cedar & Co.",
        date: `${month}-08`,
        hours: 38,
        billable: true,
        invoiced: true,
        invoiceNumber: "CC-220",
      },
      {
        id: "t4",
        clientName: "Cedar & Co.",
        date: `${month}-18`,
        hours: 6,
        billable: true,
        invoiced: false,
        invoiceNumber: "",
      },
      {
        id: "t5",
        clientName: "Northline Labs",
        date: `${month}-10`,
        hours: 12,
        billable: true,
        invoiced: false,
        invoiceNumber: "",
      },
    ],
  };
  const findings: Finding[] = analyzeAudit(input);
  return {
    ...input,
    id: "demo",
    name: "Northstar Studio — product demo",
    workspaceId: "demo",
    status: "complete",
    findings,
    updatedAt: new Date().toISOString(),
  };
}
