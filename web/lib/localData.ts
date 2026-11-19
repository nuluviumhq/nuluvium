// Everything Nuluvium keeps in this browser, and a way to remove it (Account → Clear this browser).
// localStorage: "nuluvium-orders-v1:<address>" (encrypted order schedules), "nuluvium-deterministic-v1:
// <address>" (a wallet's signature check), "nuluvium.onboard.hidden" (a view setting).
// IndexedDB "nuluvium": the encrypted recovery phrase of email logins (lib/deviceKeys.ts).
// Nothing here is on any server; the login provider's own session is ended by logging out.

const PREFIX = "nuluvium";
const DB_NAME = "nuluvium";

/** Removes every Nuluvium record from this browser, for every account that used it. */
export async function clearThisBrowser(): Promise<void> {
  try {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing was stored either.
  }
  await new Promise<void>((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      // Another tab still has the database open: it is deleted once that tab closes.
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
