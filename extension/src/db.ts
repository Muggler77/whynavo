import { defaultState } from "./defaultState";
import { MIGRATION_BACKUP_KEY, isAppState, migrateState } from "./migrations";
import { mergeLocalPeerState, normalizeState, validateAppStatePayload } from "./sync";
import type { AppState } from "./types";

const DB_NAME = "whytab";
const DB_VERSION = 1;
const STORE = "kv";
const STATE_KEY = "app-state";
const ANONYMOUS_STATE_KEY = "app-state:anonymous";
const accountStateKey = (userId?: string) => userId ? `app-state:user:${userId}` : ANONYMOUS_STATE_KEY;
const deletedAccountMarkerKey = (userId: string) => `deleted-account:user:${userId}`;
const RATES_KEY = "rates-cache";
const WEATHER_KEY = "weather-cache";
export const CORRUPT_STATE_BACKUP_KEY = "corrupt-state-backup";

export const accountScopedKey = (base: string, userId?: string) => `${base}:${userId ? `user:${userId}` : "anonymous"}`;

let dbPromise: Promise<IDBDatabase> | undefined;

const openDb = () => {
  if (dbPromise) return dbPromise;
  let openingPromise: Promise<IDBDatabase>;
  openingPromise = new Promise((resolve, reject) => {
    let abandoned = false;
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    const clearOpeningPromise = () => {
      if (dbPromise === openingPromise) dbPromise = undefined;
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      if (abandoned) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        clearOpeningPromise();
      };
      resolve(db);
    };
    request.onblocked = () => {
      if (abandoned) return;
      abandoned = true;
      clearOpeningPromise();
      reject(new Error("IndexedDB upgrade is blocked by another whytab tab"));
    };
    request.onerror = () => {
      if (abandoned) return;
      abandoned = true;
      clearOpeningPromise();
      reject(request.error);
    };
  });
  dbPromise = openingPromise;
  return openingPromise;
};

export async function readKey<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function writeKey<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
}

export async function deleteKey(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
}

async function migrateStoredState(stored: AppState | undefined, save: (state: AppState) => Promise<void>, userId?: string): Promise<AppState> {
  if (!stored) return defaultState();
  let validStored = false;
  if (stored && isAppState(stored)) {
    try {
      validateAppStatePayload(normalizeState(stored), "本机数据");
      validStored = true;
    } catch {
      validStored = false;
    }
  }
  if (stored && !validStored) {
    await writeKey(accountScopedKey(CORRUPT_STATE_BACKUP_KEY, userId), {
      savedAt: new Date().toISOString(),
      value: stored
    });
  }
  const migration = migrateState(validStored ? stored : undefined, userId);
  if (migration.backup) await writeKey(accountScopedKey(MIGRATION_BACKUP_KEY, userId), migration.backup);
  if (stored && migration.migrated) await save(migration.state);
  if (stored?.version === 1) return migration.state;
  const initial = defaultState();
  await save(initial);
  return initial;
}

export async function loadState(): Promise<AppState> {
  const stored = await readKey<AppState>(STATE_KEY);
  return migrateStoredState(stored, saveState);
}

export async function saveState(state: AppState): Promise<void> {
  await writeKey(STATE_KEY, state);
}

export async function loadStateForAccount(userId?: string): Promise<{ state: AppState; existed: boolean; recovered: boolean }> {
  if (userId && await readKey(deletedAccountMarkerKey(userId))) {
    return { state: defaultState(), existed: false, recovered: false };
  }
  const key = accountStateKey(userId);
  const scopedStored = await readKey<AppState>(key);
  const legacyStored = !userId && !scopedStored ? await readKey<AppState>(STATE_KEY) : undefined;
  const stored = scopedStored || legacyStored;
  let recovered = false;
  if (stored) {
    try {
      if (!isAppState(stored)) throw new Error("invalid local state");
      validateAppStatePayload(normalizeState(stored), "本机数据");
    } catch {
      recovered = true;
    }
  }
  const state = await migrateStoredState(stored, (next) => saveStateForAccount(next, userId), userId);
  if (legacyStored) {
    await saveStateForAccount(state, userId);
    await deleteKey(STATE_KEY);
  }
  return { state, existed: Boolean(stored) && !recovered, recovered };
}

export async function saveStateForAccount(state: AppState, userId?: string): Promise<void> {
  if (!userId) {
    await writeKey(accountStateKey(), state);
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const markerRequest = store.get(deletedAccountMarkerKey(userId));
    let blockedByDeletion = false;
    markerRequest.onsuccess = () => {
      if (markerRequest.result) {
        blockedByDeletion = true;
        tx.abort();
        return;
      }
      store.put(state, accountStateKey(userId));
    };
    markerRequest.onerror = () => tx.abort();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(
      blockedByDeletion
        ? new Error("Deleted account data cannot be written again")
        : tx.error || markerRequest.error || new Error("IndexedDB transaction aborted")
    );
  });
}

export async function mergeAndSaveStateForAccount(state: AppState, userId?: string): Promise<AppState> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const markerRequest = userId ? store.get(deletedAccountMarkerKey(userId)) : undefined;
    let request: IDBRequest | undefined;
    let merged = state;
    let blockedByDeletion = false;

    const mergeStoredState = () => {
      request = store.get(accountStateKey(userId));
      request.onsuccess = () => {
        const stored = request?.result as AppState | undefined;
        if (stored) {
          try {
            if (!isAppState(stored)) throw new Error("invalid local state");
            validateAppStatePayload(normalizeState(stored), "本机数据");
            merged = mergeLocalPeerState(state, stored);
          } catch {
            store.put({
              savedAt: new Date().toISOString(),
              value: stored
            }, accountScopedKey(CORRUPT_STATE_BACKUP_KEY, userId));
          }
        }
        store.put(merged, accountStateKey(userId));
      };
      request.onerror = () => tx.abort();
    };

    if (markerRequest) {
      markerRequest.onsuccess = () => {
        if (markerRequest.result) {
          blockedByDeletion = true;
          tx.abort();
          return;
        }
        mergeStoredState();
      };
      markerRequest.onerror = () => tx.abort();
    } else {
      mergeStoredState();
    }
    tx.oncomplete = () => resolve(merged);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(
      blockedByDeletion
        ? new Error("Deleted account data cannot be written again")
        : tx.error || markerRequest?.error || request?.error || new Error("IndexedDB transaction aborted")
    );
  });
}

export async function commitAnonymousStateAdoption(
  state: AppState,
  userId: string,
  emptyAnonymousState: AppState
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const markerRequest = store.get(deletedAccountMarkerKey(userId));
    let blockedByDeletion = false;
    markerRequest.onsuccess = () => {
      if (markerRequest.result) {
        blockedByDeletion = true;
        tx.abort();
        return;
      }
      store.put(state, accountStateKey(userId));
      store.put(emptyAnonymousState, ANONYMOUS_STATE_KEY);
    };
    markerRequest.onerror = () => tx.abort();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(
      blockedByDeletion
        ? new Error("Deleted account data cannot be written again")
        : tx.error || markerRequest.error || new Error("IndexedDB transaction aborted")
    );
  });
}

export async function deleteLocalAccountData(userId: string): Promise<void> {
  const keys = [
    accountStateKey(userId),
    accountScopedKey(WEATHER_KEY, userId),
    accountScopedKey("sync-restore-point", userId),
    accountScopedKey(MIGRATION_BACKUP_KEY, userId),
    accountScopedKey(CORRUPT_STATE_BACKUP_KEY, userId)
  ];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put({ deletedAt: new Date().toISOString() }, deletedAccountMarkerKey(userId));
    keys.forEach((key) => store.delete(key));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
}

export async function cacheWeather<T>(value: T, userId?: string): Promise<void> {
  await writeKey(accountScopedKey(WEATHER_KEY, userId), value);
}

export async function readWeather<T>(userId?: string): Promise<T | undefined> {
  return readKey<T>(accountScopedKey(WEATHER_KEY, userId));
}

export async function cacheRates<T>(value: T): Promise<void> {
  await writeKey(RATES_KEY, value);
}

export async function readRates<T>(): Promise<T | undefined> {
  return readKey<T>(RATES_KEY);
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
