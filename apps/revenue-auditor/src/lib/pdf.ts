import { isoDate } from "../../../../supabase/functions/_shared/domain";

export interface ContractCandidates {
  clientName: string;
  hourlyRate: number | null;
  retainerAmount: number | null;
  includedHours: number | null;
  paymentTermsDays: number | null;
  annualIncreasePercent: number | null;
  startDate: string;
  endDate: string;
}

function parseMoney(value = ""): number | null {
  const clean = value.replace(/[,$£€\s]/g, "");
  return clean && Number.isFinite(Number(clean)) ? Number(clean) : null;
}

function first(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return "";
}

export function extractContractCandidates(text: string): ContractCandidates {
  const clean = text.replace(/\s+/g, " ").trim();
  return {
    clientName: first(clean, [
      /(?:client|customer)\s*(?:name)?\s*[:-]\s*([A-Za-z0-9&.,' -]{2,80}?)(?=\s{2,}| agreement| effective| start|$)/i,
      /agreement\s+between\s+.+?\s+and\s+([A-Za-z0-9&.,' -]{2,80}?)(?=\.|,|\s+effective)/i,
    ]),
    hourlyRate: parseMoney(
      first(clean, [
        /(?:hourly|billing)\s+rate\s*[:-]?\s*\$?([\d,.]+)/i,
        /\$([\d,.]+)\s*(?:per|\/)\s*hour/i,
      ]),
    ),
    retainerAmount: parseMoney(
      first(clean, [/(?:monthly\s+)?retainer\s*[:-]?\s*\$?([\d,.]+)/i]),
    ),
    includedHours: parseMoney(
      first(clean, [
        /(?:includes?|included)\s+([\d.]+)\s+hours/i,
        /included\s+hours\s*[:-]?\s*([\d.]+)/i,
      ]),
    ),
    paymentTermsDays: parseMoney(
      first(clean, [
        /net\s+(\d{1,3})/i,
        /payment\s+(?:is\s+)?due\s+(?:within\s+)?(\d{1,3})\s+days/i,
      ]),
    ),
    annualIncreasePercent: parseMoney(
      first(clean, [
        /(?:annual|yearly)\s+(?:price\s+)?increase\s*[:-]?\s*([\d.]+)\s*%/i,
      ]),
    ),
    startDate: isoDate(
      first(clean, [
        /(?:effective|start)\s+date\s*[:-]?\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i,
      ]),
    ),
    endDate: isoDate(
      first(clean, [
        /(?:expiration|expiry|end|renewal)\s+date\s*[:-]?\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i,
      ]),
    ),
  };
}

export async function readContractPdf(
  file: File,
): Promise<{ text: string; candidates: ContractCandidates }> {
  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error("Choose a PDF contract.");
  }
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Contract PDFs must be 15 MB or smaller.");
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() })
    .promise;
  let text = "";
  for (let page = 1; page <= document.numPages; page += 1) {
    const content = await (await document.getPage(page)).getTextContent();
    text += ` ${content.items.map((item) => ("str" in item ? item.str : "")).join(" ")}`;
  }
  if (text.replace(/\s/g, "").length < 30) {
    throw new Error(
      "No usable text was found. Image-only contracts need OCR and are not supported yet.",
    );
  }
  return { text, candidates: extractContractCandidates(text) };
}
