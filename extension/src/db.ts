import { defaultState } from "./defaultState";
import { MIGRATION_BACKUP_KEY, isAppState, migrateState } from "./migrations";
import { mergeLocalPeerState, normalizeState, validateAppStatePayload } from "./sync";
import type { AppState } from "./types";

const DB_NAME = "whynavo";
const LEGACY_DB_NAME = ["why", "tab"].join("");
const DB_VERSION = 1;
const STORE = "kv";
const DATABASE_MIGRATION_MARKER = "database-brand-migration-v1";
const STATE_KEY = "app-state";
const ANONYMOUS_STATE_KEY = "app-state:anonymous";
const accountStateKey = (userId?: string) => userId ? `app-state:user:${userId}` : ANONYMOUS_STATE_KEY;
const deletedAccountMarkerKey = (userId: string) => `deleted-account:user:${userId}`;
const pendingAccountDeletionKey = (userId: string) => `pending-account-deletion:user:${userId}`;
const PENDING_ACCOUNT_DELETION_PREFIX = "pending-account-deletion:user:";
const RATES_KEY = "rates-cache";
const WEATHER_KEY = "weather-cache";
export const CORRUPT_STATE_BACKUP_KEY = "corrupt-state-backup";

export const accountScopedKey = (base: string, userId?: string) => `${base}:${userId ? `user:${userId}` : "anonymous"}`;

let dbPromise: Promise<IDBDatabase> | undefined;

const openDatabase = (name: string) => new Promise<IDBDatabase>((resolve, reject) => {
  let abandoned = false;
  const request = indexedDB.open(name, DB_VERSION);
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
    };
    resolve(db);
  };
  request.onblocked = () => {
    if (abandoned) return;
    abandoned = true;
    reject(new Error("IndexedDB upgrade is blocked by another WhyNavo tab"));
  };
  request.onerror = () => {
    if (abandoned) return;
    abandoned = true;
    reject(request.error);
  };
});

type LegacyDatabaseEntry = {
  key: IDBValidKey;
  value: unknown;
};

async function listDatabaseNames(): Promise<string[] | undefined> {
  const factory = indexedDB as IDBFactory & {
    databases?: () => Promise<Array<{ name?: string }>>;
  };
  if (typeof factory.databases !== "function") return undefined;
  const databases = await factory.databases();
  return databases.flatMap((database) => database.name ? [database.name] : []);
}

async function readDatabaseEntries(db: IDBDatabase): Promise<LegacyDatabaseEntry[]> {
  if (!db.objectStoreNames.contains(STORE)) return [];
  return new Promise((resolve, reject) => {
    const entries: LegacyDatabaseEntry[] = [];
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      entries.push({ key: cursor.key, value: cursor.value });
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve(entries);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB migration read aborted"));
  });
}

async function hasDatabaseMigrationMarker(db: IDBDatabase): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(DATABASE_MIGRATION_MARKER);
    request.onsuccess = () => resolve(Boolean(request.result));
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB migration marker read aborted"));
  });
}

async function migrateLegacyDatabase(): Promise<void> {
  if (LEGACY_DB_NAME === DB_NAME) return;

  const targetDb = await openDatabase(DB_NAME);
  try {
    if (await hasDatabaseMigrationMarker(targetDb)) return;

    const knownDatabaseNames = await listDatabaseNames();
    if (knownDatabaseNames && !knownDatabaseNames.includes(LEGACY_DB_NAME)) return;

    let legacyDb: IDBDatabase;
    try {
      legacyDb = await openDatabase(LEGACY_DB_NAME);
    } catch {
      // Browsers without database enumeration may report a missing legacy DB as
      // an open error. A fresh WhyNavo database is still safe to create.
      return;
    }

    try {
      const entries = await readDatabaseEntries(legacyDb);
      if (!entries.length) return;

      const existingKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const keys: IDBValidKey[] = [];
        const tx = targetDb.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).openKeyCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          keys.push(cursor.key);
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve(keys);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("IndexedDB migration key read aborted"));
      });
      const existingKeySet = new Set(existingKeys.map((key) => String(key)));
      await new Promise<void>((resolve, reject) => {
        const tx = targetDb.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        for (const entry of entries) {
          if (!existingKeySet.has(String(entry.key))) store.put(entry.value, entry.key);
        }
        store.put({ migratedAt: new Date().toISOString() }, DATABASE_MIGRATION_MARKER);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("IndexedDB migration write aborted"));
      });
    } finally {
      legacyDb.close();
    }
  } finally {
    targetDb.close();
  }
}

const openDb = () => {
  if (dbPromise) return dbPromise;
  const openingPromise = (async () => {
    await migrateLegacyDatabase();
    return openDatabase(DB_NAME);
  })();
  dbPromise = openingPromise;
  openingPromise.catch(() => {
    if (dbPromise === openingPromise) dbPromise = undefined;
  });
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

/**
 * The pre-account-isolation client stored all data under STATE_KEY. It is
 * intentionally left untouched until the user explicitly assigns it to an
 * authenticated account; otherwise a new account on the same browser could
 * silently inherit another account's old local data.
 */
export async function hasLegacyUnscopedState(): Promise<boolean> {
  return Boolean(await readKey<unknown>(STATE_KEY));
}

export async function adoptLegacyStateForAccount(userId: string): Promise<AppState> {
  if (!userId) throw new Error("无法为未登录账号导入旧版本数据");
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    let markerRequest: IDBRequest;
    let legacyRequest: IDBRequest | undefined;
    let accountRequest: IDBRequest | undefined;
    let adoptedState: AppState | undefined;
    let failure: Error | undefined;
    let blockedByDeletion = false;

    const abortWith = (error: Error) => {
      failure = error;
      tx.abort();
    };

    const readExistingAccount = (legacy: AppState) => {
      accountRequest = store.get(accountStateKey(userId));
      accountRequest.onsuccess = () => {
        const existing = accountRequest?.result as AppState | undefined;
        const migration = migrateState(legacy, userId);
        if (migration.backup) {
          store.put(migration.backup, accountScopedKey(MIGRATION_BACKUP_KEY, userId));
        }
        let normalizedLegacy: AppState;
        try {
          normalizedLegacy = normalizeState(migration.state);
          validateAppStatePayload(normalizedLegacy, "旧版本本机数据");
        } catch {
          abortWith(new Error("旧版本本机数据已损坏，未导入当前账号"));
          return;
        }

        adoptedState = normalizedLegacy;
        if (existing) {
          try {
            const normalizedExisting = normalizeState(existing);
            validateAppStatePayload(normalizedExisting, "当前账号本机数据");
            adoptedState = mergeLocalPeerState(normalizedExisting, normalizedLegacy);
          } catch {
            store.put({
              savedAt: new Date().toISOString(),
              value: existing
            }, accountScopedKey(CORRUPT_STATE_BACKUP_KEY, userId));
          }
        }
        store.put(adoptedState, accountStateKey(userId));
        store.delete(STATE_KEY);
      };
      accountRequest.onerror = () => abortWith(accountRequest?.error || new Error("读取当前账号数据失败"));
    };

    markerRequest = store.get(deletedAccountMarkerKey(userId));
    markerRequest.onsuccess = () => {
      if (markerRequest.result) {
        blockedByDeletion = true;
        tx.abort();
        return;
      }
      legacyRequest = store.get(STATE_KEY);
      legacyRequest.onsuccess = () => {
        const legacy = legacyRequest?.result as AppState | undefined;
        if (!legacy) {
          abortWith(new Error("没有找到可导入的旧版本本机数据"));
          return;
        }
        if (!isAppState(legacy)) {
          abortWith(new Error("旧版本本机数据格式无效，未导入当前账号"));
          return;
        }
        readExistingAccount(legacy);
      };
      legacyRequest.onerror = () => abortWith(legacyRequest?.error || new Error("读取旧版本本机数据失败"));
    };
    markerRequest.onerror = () => abortWith(markerRequest.error || new Error("读取账号删除状态失败"));
    tx.oncomplete = () => {
      if (adoptedState) resolve(adoptedState);
      else reject(new Error("旧版本本机数据导入未完成"));
    };
    tx.onerror = () => reject(failure || tx.error || new Error("旧版本本机数据导入失败"));
    tx.onabort = () => reject(
      failure
      || (blockedByDeletion ? new Error("已删除账号不能重新写入本机数据") : tx.error || new Error("旧版本本机数据导入已取消"))
    );
  });
}

export async function loadStateForAccount(userId?: string): Promise<{ state: AppState; existed: boolean; recovered: boolean }> {
  if (userId && await readKey(deletedAccountMarkerKey(userId))) {
    return { state: defaultState(), existed: false, recovered: false };
  }
  const key = accountStateKey(userId);
  const scopedStored = await readKey<AppState>(key);
  const stored = scopedStored;
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
    accountScopedKey(CORRUPT_STATE_BACKUP_KEY, userId),
    pendingAccountDeletionKey(userId)
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

export async function markLocalAccountDeletionPending(userId: string): Promise<void> {
  await writeKey(pendingAccountDeletionKey(userId), {
    requestedAt: new Date().toISOString()
  });
}

export async function clearLocalAccountDeletionPending(userId: string): Promise<void> {
  await deleteKey(pendingAccountDeletionKey(userId));
}

export async function clearLocalDeletedAccountMarkerForVerifiedUser(userId: string): Promise<void> {
  await deleteKey(deletedAccountMarkerKey(userId));
}

export async function readPendingLocalAccountDeletionIds(): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const ids: string[] = [];
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const key = cursor.key;
      if (
        typeof key === "string"
        && key.startsWith(PENDING_ACCOUNT_DELETION_PREFIX)
      ) {
        const userId = key.slice(PENDING_ACCOUNT_DELETION_PREFIX.length);
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
          ids.push(userId);
        }
      }
      cursor.continue();
    };
    request.onerror = () => tx.abort();
    tx.oncomplete = () => resolve(ids);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || request.error || new Error("IndexedDB transaction aborted"));
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
  downloadText(filename, JSON.stringify(data, null, 2), "application/json");
}

export function downloadText(filename: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
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
