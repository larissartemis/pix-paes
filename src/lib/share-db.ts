export interface SharedFilePayload {
  name: string;
  type: string;
  size: number;
  buffer: ArrayBuffer;
}

export interface SharedPayload {
  title: string;
  text: string;
  url: string;
  file: SharedFilePayload | null;
  receivedAt: number;
}

const DB_NAME = "pix-paes-share";
const STORE_NAME = "shared";
const RECORD_KEY = "latest";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function consumeSharedPayload(): Promise<SharedPayload | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(RECORD_KEY);
    getReq.onsuccess = () => {
      const result = (getReq.result as SharedPayload | undefined) ?? null;
      if (result) {
        store.delete(RECORD_KEY);
      }
      resolve(result);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}
