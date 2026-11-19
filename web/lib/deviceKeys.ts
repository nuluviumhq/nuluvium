// The Nuluvium secret of a person who logs in with email (a Privy embedded wallet). Their keys must
// not come from a signature of that wallet: Privy's systems can sign for it, so they could rebuild
// the keys. Instead the secret is a random 12-word recovery phrase made in this browser, shown once
// for the person to write down, and kept here encrypted with an AES-GCM key that cannot be exported
// (WebCrypto, stored in IndexedDB). It never leaves the device; another device needs the phrase.

const DB_NAME = "nuluvium";
const STORE = "device-keys";

interface StoredSecret {
  key: CryptoKey;
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** One record per Privy user, so two people sharing a browser do not mix secrets. */
const recordId = (userId: string) => `privy:${userId}`;

/** The stored recovery phrase of this user on this device, or null when there is none. */
export async function loadDeviceSecret(userId: string): Promise<string | null> {
  const stored = await withStore<StoredSecret | undefined>("readonly", (store) => store.get(recordId(userId)));
  if (!stored) return null;
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: stored.iv as BufferSource }, stored.key, stored.ciphertext);
  return new TextDecoder().decode(plain);
}

/** Stores the recovery phrase under a new non-extractable key. Replaces any earlier one. */
export async function saveDeviceSecret(userId: string, phrase: string): Promise<void> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(phrase));
  await withStore("readwrite", (store) => store.put({ key, iv, ciphertext } satisfies StoredSecret, recordId(userId)));
}
