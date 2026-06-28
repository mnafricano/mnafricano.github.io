import {
  FIELD_DEFINITIONS,
  analyzeAudit,
  createDemoAudit,
  createEmptyAudit,
  deduplicate,
  escapeHtml,
  extractContractCandidates,
  mapRows,
  parseCsv,
  suggestMapping,
  summarizeFindings,
  uid
} from "./core.js";
import { clearAudits, deleteAudit, listAudits, saveAudit } from "./storage.js";

const state = {
  audit: null,
  view: "import",
  pendingCsv: null,
  filters: { client: "", category: "", severity: "", confidence: "", sort: "amount" }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const dialogs = Object.fromEntries($$("[data-dialog]").map((dialog) => [dialog.dataset.dialog, dialog]));
const money = (value, currency = state.audit?.currency || "USD") => value === null || value === undefined
  ? "Not calculated"
  : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
const numberOrNull = (value) => value === "" ? null : Number(value);
let toastTimer;

function toast(message, error = false) {
  const element = $("[data-toast]");
  element.textContent = message;
  element.style.background = error ? "#8d2f28" : "";
  element.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("visible"), 4200);
}

function showDialog(name) {
  const dialog = dialogs[name];
  if (dialog && !dialog.open) dialog.showModal();
}

function closeDialogs() {
  Object.values(dialogs).forEach((dialog) => { if (dialog.open) dialog.close(); });
}

async function persist(message = "Saved locally") {
  if (!state.audit) return;
  try {
    state.audit = await saveAudit(state.audit);
    $("[data-save-state]").textContent = `${message} · ${new Date(state.audit.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } catch (error) {
    $("[data-save-state]").textContent = "Could not save in this browser";
    toast(error.message, true);
  }
}

function showLanding() {
  state.audit = null;
  document.body.classList.remove("workspace-active");
  $$("[data-landing]").forEach((element) => { element.hidden = false; });
  $("[data-workspace]").hidden = true;
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openAudit(audit, view = "import") {
  state.audit = audit;
  state.view = view;
  document.body.classList.add("workspace-active");
  $$("[data-landing]").forEach((element) => { element.hidden = true; });
  $("[data-workspace]").hidden = false;
  renderAll();
  setView(view);
  window.history.replaceState({}, "", "#workspace");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setView(view) {
  state.view = view;
  $$("[data-view]").forEach((element) => { element.hidden = element.dataset.view !== view; });
  $$("[data-view-target]").forEach((button) => {
    button.setAttribute("aria-current", button.dataset.viewTarget === view ? "step" : "false");
  });
  if (view === "findings") renderFindings();
  $(`[data-view="${view}"]`)?.focus({ preventScroll: true });
}

function renderCounts() {
  if (!state.audit) return;
  ["invoices", "payments", "timeEntries"].forEach((type) => {
    $(`[data-record-count="${type}"]`).textContent = `${state.audit[type].length} record${state.audit[type].length === 1 ? "" : "s"}`;
  });
  const confirmed = state.audit.contracts.filter((contract) => contract.confirmed).length;
  $("[data-record-count=contracts]").textContent = `${confirmed} confirmed contract${confirmed === 1 ? "" : "s"}`;
  $("[data-term-count]").textContent = confirmed || "";
  $("[data-finding-count]").textContent = state.audit.findings.length || "";
  const total = state.audit.invoices.length + state.audit.payments.length + state.audit.timeEntries.length;
  $("[data-import-total]").textContent = total;
}

function renderContracts() {
  const container = $("[data-contract-list]");
  const contracts = state.audit?.contracts || [];
  $("[data-contract-empty]").hidden = contracts.length > 0;
  container.innerHTML = contracts.map((contract) => {
    const terms = [
      ["Hourly rate", money(contract.hourlyRate)],
      ["Monthly retainer", money(contract.retainerAmount)],
      ["Included hours", contract.includedHours ?? "Not set"],
      ["Payment terms", contract.paymentTermsDays !== null ? `Net ${contract.paymentTermsDays}` : "Not set"],
      ["Annual increase", contract.annualIncreasePercent ? `${contract.annualIncreasePercent}%` : "Not set"],
      ["Start date", contract.startDate || "Not set"],
      ["Renewal / end", contract.endDate || "Not set"],
      ["Status", contract.confirmed ? "Human-confirmed" : "Needs review"]
    ];
    return `
      <article class="contract-item">
        <header>
          <div>
            <h3>${escapeHtml(contract.clientName || "Unassigned contract")}</h3>
            <p>${escapeHtml(contract.sourceName || "Manually entered terms")}</p>
          </div>
          <div>
            <button class="button button-secondary button-small" type="button" data-edit-contract="${contract.id}">${contract.confirmed ? "Review" : "Confirm terms"}</button>
            <button class="text-button" type="button" data-delete-contract="${contract.id}" aria-label="Delete contract for ${escapeHtml(contract.clientName)}">Delete</button>
          </div>
        </header>
        <div class="contract-terms">
          ${terms.map(([label, value]) => `<div><span>${label}</span><b>${escapeHtml(String(value))}</b></div>`).join("")}
        </div>
      </article>`;
  }).join("");
}

function categoryLabel(category) {
  return {
    unbilled: "Unbilled work",
    underbilling: "Underbilling",
    retainer: "Retainer",
    overdue: "Overdue",
    increase: "Price increase",
    renewal: "Renewal",
    scope: "Scope creep"
  }[category] || category;
}

function filteredFindings() {
  const severityRank = { critical: 3, high: 2, medium: 1 };
  const filtered = state.audit.findings.filter((item) =>
    (!state.filters.client || item.clientName === state.filters.client)
    && (!state.filters.category || item.category === state.filters.category)
    && (!state.filters.severity || item.severity === state.filters.severity)
    && (!state.filters.confidence || item.confidence === state.filters.confidence)
  );
  return filtered.sort((a, b) => {
    if (state.filters.sort === "client") return a.clientName.localeCompare(b.clientName);
    if (state.filters.sort === "severity") return severityRank[b.severity] - severityRank[a.severity];
    return (b.amount || 0) - (a.amount || 0);
  });
}

function updateFilterOptions() {
  const client = $("[data-filter=client]");
  const category = $("[data-filter=category]");
  const clients = [...new Set(state.audit.findings.map((item) => item.clientName))].sort();
  const categories = [...new Set(state.audit.findings.map((item) => item.category))].sort();
  client.innerHTML = `<option value="">All clients</option>${clients.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
  category.innerHTML = `<option value="">All categories</option>${categories.map((name) => `<option value="${name}">${categoryLabel(name)}</option>`).join("")}`;
  client.value = state.filters.client;
  category.value = state.filters.category;
}

function renderFindings() {
  if (!state.audit) return;
  const summary = summarizeFindings(state.audit.findings);
  $("[data-metric=recoverable]").textContent = money(summary.recoverable);
  $("[data-metric=overdue]").textContent = money(summary.overdue);
  $("[data-metric=renewalRisk]").textContent = money(summary.renewalRisk);
  $("[data-metric=priority]").textContent = (summary.severity.critical || 0) + (summary.severity.high || 0);
  $("[data-severity-summary]").textContent = `${summary.severity.critical || 0} critical · ${summary.severity.high || 0} high · ${summary.severity.medium || 0} medium`;
  updateFilterOptions();

  const findings = filteredFindings();
  const clientSummary = $("[data-client-summary]");
  if (state.filters.client) {
    const clientName = state.filters.client;
    const contract = state.audit.contracts.find((item) => item.clientName === clientName && item.confirmed);
    const clientFindings = state.audit.findings.filter((item) => item.clientName === clientName);
    const exposure = clientFindings.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const invoices = state.audit.invoices.filter((item) => item.clientName === clientName).length;
    const payments = state.audit.payments.filter((item) => item.clientName === clientName).length;
    const entries = state.audit.timeEntries.filter((item) => item.clientName === clientName).length;
    clientSummary.hidden = false;
    clientSummary.innerHTML = `<h3>${escapeHtml(clientName)} detail</h3><p>${clientFindings.length} findings · ${money(exposure)} total estimated exposure · ${invoices} invoices · ${payments} payments · ${entries} time entries · ${contract ? "confirmed contract terms available" : "no confirmed contract terms"}</p>`;
  } else {
    clientSummary.hidden = true;
    clientSummary.innerHTML = "";
  }
  $("[data-visible-count]").textContent = findings.length;
  $("[data-findings-empty]").hidden = findings.length > 0;
  $("[data-findings-list]").innerHTML = findings.map((item) => `
    <article class="finding" data-severity="${item.severity}">
      <span class="finding-bar" aria-hidden="true"></span>
      <div class="finding-body">
        <div class="finding-meta">
          <span class="pill">${escapeHtml(item.clientName)}</span>
          <span class="pill">${categoryLabel(item.category)}</span>
          <span class="pill">${item.severity} severity</span>
          <span class="pill">${item.confidence} confidence</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.explanation)}</p>
        <details>
          <summary>See supporting evidence</summary>
          <p>${escapeHtml(item.evidence)}</p>
        </details>
        <p class="finding-action"><strong>Next action:</strong> ${escapeHtml(item.action)}</p>
      </div>
      <div class="finding-amount">${item.amount === null ? "—" : money(item.amount)}<small>${item.status === "incomplete" ? "Needs a confirmed value" : "Estimated value"}</small></div>
    </article>
  `).join("");
}

function renderAll() {
  if (!state.audit) return;
  $("[data-audit-name]").textContent = state.audit.name;
  renderCounts();
  renderContracts();
  renderFindings();
}

async function runAnalysis() {
  state.audit.findings = analyzeAudit(state.audit);
  await persist("Analysis saved");
  renderAll();
  setView("findings");
  toast(`${state.audit.findings.length} finding${state.audit.findings.length === 1 ? "" : "s"} generated from local data.`);
}

async function startDemo() {
  const demo = createDemoAudit();
  demo.findings = analyzeAudit(demo);
  try {
    state.audit = await saveAudit(demo);
  } catch (error) {
    state.audit = demo;
    toast(`Demo opened, but local saving is unavailable: ${error.message}`, true);
  }
  openAudit(state.audit, "findings");
}

async function createAudit(name, currency) {
  const audit = createEmptyAudit(name);
  audit.currency = currency || "USD";
  try {
    await saveAudit(audit);
    openAudit(audit);
    toast("Private audit created in this browser.");
  } catch (error) {
    toast(error.message, true);
  }
}

async function openAuditLibrary() {
  showDialog("audits");
  const container = $("[data-audit-list]");
  container.innerHTML = "<p>Loading local audits…</p>";
  try {
    const audits = await listAudits();
    container.innerHTML = audits.length ? audits.map((audit) => `
      <article class="audit-row">
        <div><strong>${escapeHtml(audit.name)}</strong><p>Updated ${new Date(audit.updatedAt).toLocaleString()} · ${audit.findings.length} findings</p></div>
        <div><button type="button" data-open-audit="${audit.id}">Open</button><button type="button" data-delete-audit="${audit.id}" aria-label="Delete ${escapeHtml(audit.name)}">Delete</button></div>
      </article>
    `).join("") : "<p>No saved audits are stored in this browser yet.</p>";
  } catch (error) {
    container.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

function prepareMapping(file, type, parsed) {
  state.pendingCsv = { file, type, parsed };
  const definition = FIELD_DEFINITIONS[type];
  const mapping = suggestMapping(parsed.headers, type);
  $("[data-mapping-title]").textContent = `Map ${file.name}`;
  $("[data-mapping-note]").textContent = `${parsed.rows.length} rows found. Required fields are marked with an asterisk.`;
  $("[data-mapping-fields]").innerHTML = Object.entries(definition.fields).map(([field, label]) => `
    <label>${label}${definition.required.includes(field) ? " *" : ""}
      <select name="${field}">
        <option value="">Not mapped</option>
        ${parsed.headers.map((header) => `<option value="${escapeHtml(header)}" ${mapping[field] === header ? "selected" : ""}>${escapeHtml(header)}</option>`).join("")}
      </select>
    </label>
  `).join("");
  $("[data-preview-head]").innerHTML = `<tr>${parsed.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>`;
  $("[data-preview-body]").innerHTML = parsed.rows.slice(0, 3).map((row) =>
    `<tr>${parsed.headers.map((header) => `<td>${escapeHtml(row[header])}</td>`).join("")}</tr>`
  ).join("");
  showDialog("mapping");
}

async function handleCsvFile(file, type) {
  if (!state.audit) return;
  if (!file || file.size > 10 * 1024 * 1024) {
    toast("Choose a CSV file smaller than 10 MB.", true);
    return;
  }
  try {
    const parsed = parseCsv(await file.text());
    prepareMapping(file, type, parsed);
  } catch (error) {
    toast(error.message, true);
  }
}

async function importMappedCsv() {
  const { type, parsed } = state.pendingCsv;
  const form = $("[data-mapping-form]");
  const mapping = Object.fromEntries(Object.keys(FIELD_DEFINITIONS[type].fields)
    .map((field) => [field, form.elements[field].value]));
  try {
    const incoming = mapRows(parsed, type, mapping);
    const result = deduplicate(state.audit[type], incoming, type);
    state.audit[type] = result.records;
    state.audit.clients = mergeClients(state.audit);
    await persist();
    renderAll();
    closeDialogs();
    toast(`${result.added} ${type === "timeEntries" ? "time entries" : type} imported${result.skipped ? `; ${result.skipped} duplicate${result.skipped === 1 ? "" : "s"} skipped` : ""}.`);
  } catch (error) {
    toast(error.message, true);
  }
}

function mergeClients(audit) {
  const names = [...new Set([
    ...audit.clients.map((item) => item.name),
    ...audit.contracts.map((item) => item.clientName),
    ...audit.invoices.map((item) => item.clientName),
    ...audit.timeEntries.map((item) => item.clientName)
  ].filter(Boolean))];
  return names.map((name) => audit.clients.find((item) => item.name === name) || { id: uid("client"), name });
}

function openContractForm(contract = {}) {
  const form = $("[data-contract-form]");
  form.reset();
  const fields = ["id", "sourceName", "clientName", "hourlyRate", "retainerAmount", "includedHours", "paymentTermsDays", "annualIncreasePercent", "startDate", "endDate"];
  fields.forEach((field) => { form.elements[field].value = contract[field] ?? ""; });
  form.elements.confirmed.checked = Boolean(contract.confirmed);
  $("[data-contract-source]").textContent = contract.sourceName
    ? `Candidates were extracted locally from ${contract.sourceName}. Blank values were not detected. Verify every value against the PDF.`
    : "Enter only terms you can verify in the source contract.";
  showDialog("contract");
}

async function saveContractFromForm() {
  const form = $("[data-contract-form]");
  const contract = {
    id: form.elements.id.value || uid("contract"),
    sourceName: form.elements.sourceName.value || "Manually entered terms",
    clientName: form.elements.clientName.value.trim(),
    hourlyRate: numberOrNull(form.elements.hourlyRate.value),
    retainerAmount: numberOrNull(form.elements.retainerAmount.value),
    includedHours: numberOrNull(form.elements.includedHours.value),
    paymentTermsDays: numberOrNull(form.elements.paymentTermsDays.value),
    annualIncreasePercent: numberOrNull(form.elements.annualIncreasePercent.value),
    startDate: form.elements.startDate.value,
    endDate: form.elements.endDate.value,
    confirmed: form.elements.confirmed.checked
  };
  const index = state.audit.contracts.findIndex((item) => item.id === contract.id);
  if (index >= 0) state.audit.contracts[index] = contract;
  else state.audit.contracts.push(contract);
  state.audit.clients = mergeClients(state.audit);
  await persist();
  renderAll();
  closeDialogs();
  toast("Human-confirmed contract terms saved locally.");
}

async function extractPdf(file) {
  if (!file || file.size > 15 * 1024 * 1024) {
    toast("Choose a text-based PDF smaller than 15 MB.", true);
    return;
  }
  toast("Reading PDF text locally…");
  try {
    const pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
    const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = "";
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      text += ` ${content.items.map((item) => item.str).join(" ")}`;
    }
    if (text.replace(/\s/g, "").length < 30) {
      throw new Error("No usable text was found. This may be a scanned/image-only PDF, which the MVP does not support.");
    }
    openContractForm({ id: uid("contract"), sourceName: file.name, ...extractContractCandidates(text), confirmed: false });
    toast("Candidate terms extracted locally. Verify them against the PDF.");
  } catch (error) {
    toast(`The PDF could not be read: ${error.message}`, true);
  }
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function download(filename, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportFindings() {
  if (!state.audit) return;
  const headers = ["Client", "Category", "Severity", "Confidence", "Status", "Estimated amount", "Finding", "Calculation", "Evidence", "Recommended action"];
  const rows = state.audit.findings.map((item) => [
    item.clientName, categoryLabel(item.category), item.severity, item.confidence, item.status,
    item.amount ?? "", item.title, item.explanation, item.evidence, item.action
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  download(`${state.audit.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-findings.csv`, csv, "text/csv;charset=utf-8");
  toast("Findings CSV created locally.");
}

document.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  const view = event.target.closest("[data-view-target]")?.dataset.viewTarget;
  if (view && state.audit) setView(view);

  if (action === "demo") await startDemo();
  if (action === "new") showDialog("new");
  if (action === "home") showLanding();
  if (action === "open-audits") await openAuditLibrary();
  if (action === "close-dialog") closeDialogs();
  if (action === "manual-contract") openContractForm();
  if (action === "analyze") await runAnalysis();
  if (action === "export") exportFindings();
  if (action === "print") {
    if (state.view !== "findings") setView("findings");
    window.print();
  }
  if (action === "reset-filters") {
    state.filters = { client: "", category: "", severity: "", confidence: "", sort: "amount" };
    $$("[data-filter]").forEach((select) => { select.value = state.filters[select.dataset.filter]; });
    renderFindings();
  }
  if (action === "clear-all") {
    if (window.confirm("Permanently erase every Revenue Leak Auditor audit stored in this browser? This cannot be undone.")) {
      try {
        await clearAudits();
        closeDialogs();
        showLanding();
        toast("All local audits were permanently erased.");
      } catch (error) { toast(error.message, true); }
    }
  }

  const openId = event.target.closest("[data-open-audit]")?.dataset.openAudit;
  if (openId) {
    const audits = await listAudits();
    const audit = audits.find((item) => item.id === openId);
    if (audit) { closeDialogs(); openAudit(audit, audit.findings.length ? "findings" : "import"); }
  }
  const deleteId = event.target.closest("[data-delete-audit]")?.dataset.deleteAudit;
  if (deleteId && window.confirm("Delete this local audit permanently?")) {
    await deleteAudit(deleteId);
    await openAuditLibrary();
    toast("Audit deleted.");
  }
  const editContract = event.target.closest("[data-edit-contract]")?.dataset.editContract;
  if (editContract) openContractForm(state.audit.contracts.find((item) => item.id === editContract));
  const deleteContract = event.target.closest("[data-delete-contract]")?.dataset.deleteContract;
  if (deleteContract && window.confirm("Delete these contract terms?")) {
    state.audit.contracts = state.audit.contracts.filter((item) => item.id !== deleteContract);
    await persist();
    renderAll();
    toast("Contract terms deleted.");
  }
});

$$("[data-csv-input]").forEach((input) => input.addEventListener("change", async () => {
  await handleCsvFile(input.files[0], input.dataset.csvInput);
  input.value = "";
}));
$("[data-pdf-input]").addEventListener("change", async (event) => {
  await extractPdf(event.target.files[0]);
  event.target.value = "";
});

$("[data-new-form]").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!event.target.reportValidity()) return;
  closeDialogs();
  await createAudit(event.target.elements.name.value, event.target.elements.currency.value);
  event.target.reset();
});
$("[data-mapping-form]").addEventListener("submit", async (event) => {
  event.preventDefault();
  await importMappedCsv();
});
$("[data-contract-form]").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!event.target.reportValidity()) return;
  await saveContractFromForm();
});

$$("[data-filter]").forEach((select) => select.addEventListener("change", () => {
  state.filters[select.dataset.filter] = select.value;
  renderFindings();
}));

window.addEventListener("hashchange", () => {
  if (!window.location.hash && state.audit) showLanding();
});

if (window.location.hash === "#workspace") {
  openAuditLibrary();
} else {
  showLanding();
}
