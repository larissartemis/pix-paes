const DB_NAME = "pix-paes-share";
const STORE_NAME = "shared";
const RECORD_KEY = "latest";

function openShareDb() {
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

async function saveSharedPayload(payload) {
  const db = await openShareDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(payload, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Intercept Web Share Target POST requests
  if (url.pathname === "/share-target" && event.request.method === "POST") {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const title = formData.get("title")?.toString() || "";
          const text = formData.get("text")?.toString() || "";
          const sharedUrl = formData.get("url")?.toString() || "";
          const files = formData.getAll("file");
          const firstFile = files.find((f) => f && typeof f !== "string" && f.size > 0);

          let filePayload = null;
          if (firstFile) {
            const buffer = await firstFile.arrayBuffer();
            filePayload = {
              name: firstFile.name || "comprovante",
              type: firstFile.type || "application/octet-stream",
              size: firstFile.size,
              buffer,
            };
          }

          await saveSharedPayload({
            title,
            text,
            url: sharedUrl,
            file: filePayload,
            receivedAt: Date.now(),
          });

          return Response.redirect("/?shared=1", 303);
        } catch (err) {
          console.error("[SW] Error handling share-target:", err);
          return Response.redirect("/?shared_error=1", 303);
        }
      })()
    );
    return;
  }

  // Standard network-first pass-through for app routes and assets
  if (event.request.method === "GET") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
