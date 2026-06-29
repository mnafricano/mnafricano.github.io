const LEGACY_DB = "revenue-leak-auditor";
const LEGACY_STORE = "audits";

export interface LegacyAudit {
  id: string;
  name: string;
  currency?: string;
  clients?: unknown[];
  contracts?: unknown[];
  invoices?: unknown[];
  payments?: unknown[];
  timeEntries?: unknown[];
  findings?: unknown[];
}

export function listLegacyAudits(): Promise<LegacyAudit[]> {
  return new Promise((resolve) => {
    if (!("indexedDB" in window)) {
      resolve([]);
      return;
    }
    const request = indexedDB.open(LEGACY_DB);
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LEGACY_STORE)) {
        database.close();
        resolve([]);
        return;
      }
      const transaction = database.transaction(LEGACY_STORE, "readonly");
      const all = transaction.objectStore(LEGACY_STORE).getAll();
      all.onerror = () => resolve([]);
      all.onsuccess = () => resolve((all.result || []) as LegacyAudit[]);
      transaction.oncomplete = () => database.close();
    };
  });
}

export function deleteLegacyAudit(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB);
    request.onerror = () =>
      reject(new Error("Legacy browser storage could not be opened."));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(LEGACY_STORE, "readwrite");
      transaction.objectStore(LEGACY_STORE).delete(id);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () =>
        reject(new Error("Legacy audit could not be deleted."));
    };
  });
}
