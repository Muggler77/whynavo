import { defaultState } from "./defaultState";
import type { AppState } from "./types";
import { APP_VERSION, DATA_SCHEMA_VERSION } from "./version";

export const MIGRATION_BACKUP_KEY = "migration-backup";

export type StateBackup = {
  ownerId?: string;
  label: string;
  savedAt: string;
  appVersion: string;
  dataSchemaVersion: number;
  state: AppState;
};

export type MigrationResult = {
  state: AppState;
  migrated: boolean;
  backup?: StateBackup;
};

export function stateSchemaVersion(state?: Partial<AppState>) {
  return state?.dataSchemaVersion || state?.version || 1;
}

export function createStateBackup(label: string, state: AppState, ownerId?: string): StateBackup {
  return {
    ownerId,
    label,
    savedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    dataSchemaVersion: stateSchemaVersion(state),
    state
  };
}

export const isAppState = (value: unknown): value is AppState => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<AppState>;
  const recordArray = (entries: unknown) => Array.isArray(entries) && entries.every((entry) => (
    Boolean(entry)
    && typeof entry === "object"
    && !Array.isArray(entry)
    && typeof (entry as { id?: unknown }).id === "string"
  ));
  return Boolean(
    state.version === 1
    && state.settings
    && typeof state.settings === "object"
    && !Array.isArray(state.settings)
    && recordArray(state.shortcuts)
    && recordArray(state.shortcutGroups)
    && (state.shortcutFolders === undefined || recordArray(state.shortcutFolders))
    && recordArray(state.todos)
    && recordArray(state.notes)
    && recordArray(state.countdowns)
    && (state.sync === undefined || (typeof state.sync === "object" && !Array.isArray(state.sync)))
  );
};

export function migrateState(stored: unknown, ownerId?: string): MigrationResult {
  if (!isAppState(stored)) {
    return { state: defaultState(), migrated: true };
  }

  const schemaVersion = stateSchemaVersion(stored);
  const migratedState: AppState = {
    ...stored,
    version: 1,
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    clientVersion: APP_VERSION,
    minimumClientVersion: stored.minimumClientVersion || "0.1.0"
  };

  const migrated = schemaVersion !== DATA_SCHEMA_VERSION || stored.clientVersion !== APP_VERSION;
  return {
    state: migratedState,
    migrated,
    backup: migrated ? createStateBackup("更新前自动备份", stored, ownerId) : undefined
  };
}
