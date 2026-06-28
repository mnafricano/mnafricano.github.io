import { SCHEMA_VERSION } from "./core.js";

const DB_NAME = "revenue-leak-auditor";
const STORE = "audits";
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser does not support IndexedDB. Try a current version of Chrome, Firefox, Edge, or Safari."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Local storage could not be opened."));
    request.onblocked = () => reject(new Error("Local storage is blocked by another open tab."));
  });
}

async function transact(mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let request;
    try {
      request = action(store);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("The browser could not complete the local storage operation."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(new Error("The browser could not save the audit. Check available storage and privacy settings."));
    };
  });
}

export function migrateAudit(audit) {
  const version = Number(audit?.schemaVersion || 0);
  if (version > SCHEMA_VERSION) throw new Error("This audit was created by a newer version of the app.");
  const migrated = {
    ...audit,
    schemaVersion: SCHEMA_VERSION,
    currency: audit?.currency || "USD",
    clients: Array.isArray(audit?.clients) ? audit.clients : [],
    contracts: Array.isArray(audit?.contracts) ? audit.contracts : [],
    invoices: Array.isArray(audit?.invoices) ? audit.invoices : [],
    payments: Array.isArray(audit?.payments) ? audit.payments : [],
    timeEntries: Array.isArray(audit?.timeEntries) ? audit.timeEntries : [],
    findings: Array.isArray(audit?.findings) ? audit.findings : []
  };
  return migrated;
}

export async function listAudits() {
  const audits = await transact("readonly", (store) => store.getAll());
  return audits.map(migrateAudit).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getAudit(id) {
  const audit = await transact("readonly", (store) => store.get(id));
  return audit ? migrateAudit(audit) : null;
}

export async function saveAudit(audit) {
  const record = migrateAudit({ ...audit, updatedAt: new Date().toISOString() });
  await transact("readwrite", (store) => store.put(record));
  return record;
}

export async function deleteAudit(id) {
  await transact("readwrite", (store) => store.delete(id));
}

export async function clearAudits() {
  await transact("readwrite", (store) => store.clear());
}
