import { LEGACY_IMPORT_DATA } from "./legacy-data";
import { applyLegacyImportIfNeeded, createEmptyState } from "./state";
import type { ExtensionState, LegacyImportData } from "./types";

export const STORAGE_STATE_KEY = "ytdListProState";
export const STORAGE_ACTIVE_ACCOUNT_KEY = "ytdListProActiveAccount";
export const STORAGE_LEGACY_OWNER_KEY = "ytdListProLegacyOwner";
export const DEFAULT_ACCOUNT_ID = "default";

let activeAccountId = DEFAULT_ACCOUNT_ID;

export const storageKeyForAccount = (accountId: string): string =>
  accountId === DEFAULT_ACCOUNT_ID ? STORAGE_STATE_KEY : `${STORAGE_STATE_KEY}:${accountId}`;

export function configureStorageAccount(accountId: string | undefined): string {
  activeAccountId = accountId?.trim() || DEFAULT_ACCOUNT_ID;
  return activeAccountId;
}

export const getActiveStorageAccount = (): string => activeAccountId;

export const activeStateStorageKey = (): string => storageKeyForAccount(activeAccountId);

export interface ExtensionStorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const getChromeStorageArea = (): ExtensionStorageArea | undefined => {
  const runtimeChrome = globalThis.chrome;
  return runtimeChrome?.storage?.local as ExtensionStorageArea | undefined;
};

const isExtensionState = (value: unknown): value is ExtensionState => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const maybeState = value as Partial<ExtensionState>;
  return (
    typeof maybeState.schemaVersion === "number" &&
    typeof maybeState.channels === "object" &&
    typeof maybeState.categories === "object" &&
    Array.isArray(maybeState.categoryOrder) &&
    Array.isArray(maybeState.uncategorizedChannelIds)
  );
};

export function isExtensionContextInvalidated(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message)
        : String(error);
  return /extension context invalidated/i.test(message);
}

export function createMemoryStorageArea(initial: Record<string, unknown> = {}): ExtensionStorageArea {
  const data = { ...initial };
  return {
    async get(keys?: string | string[] | Record<string, unknown> | null) {
      if (!keys) {
        return { ...data };
      }
      if (typeof keys === "string") {
        return { [keys]: data[keys] };
      }
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, data[key]]));
      }
      return Object.fromEntries(
        Object.entries(keys).map(([key, defaultValue]) => [key, data[key] ?? defaultValue])
      );
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items);
    }
  };
}

export async function loadState(storageArea = getChromeStorageArea()): Promise<ExtensionState> {
  if (!storageArea) {
    return createEmptyState();
  }
  try {
    const key = activeStateStorageKey();
    const result = await storageArea.get(key);
    const state = result[key];
    return isExtensionState(state) ? state : createEmptyState();
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      return createEmptyState();
    }
    throw error;
  }
}

export async function saveState(
  state: ExtensionState,
  storageArea = getChromeStorageArea()
): Promise<ExtensionState> {
  if (!storageArea) {
    return state;
  }
  try {
    await storageArea.set({ [activeStateStorageKey()]: state });
    return state;
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      return state;
    }
    throw error;
  }
}

/**
 * Point storage at the given account and, the first time a real account is
 * seen, let it adopt the pre-account (legacy) data so an existing user keeps
 * everything after upgrading. The legacy key is left in place as a backup;
 * other accounts start from an empty state.
 */
export async function activateAccount(
  accountId: string | undefined,
  storageArea = getChromeStorageArea()
): Promise<string> {
  const resolved = configureStorageAccount(accountId);
  if (!storageArea) {
    return resolved;
  }
  try {
    await storageArea.set({ [STORAGE_ACTIVE_ACCOUNT_KEY]: resolved });
    if (resolved === DEFAULT_ACCOUNT_ID) {
      return resolved;
    }
    const accountKey = storageKeyForAccount(resolved);
    const result = await storageArea.get([accountKey, STORAGE_STATE_KEY, STORAGE_LEGACY_OWNER_KEY]);
    const legacyOwner = result[STORAGE_LEGACY_OWNER_KEY];
    if (!isExtensionState(result[accountKey]) && isExtensionState(result[STORAGE_STATE_KEY])) {
      if (legacyOwner === undefined || legacyOwner === resolved) {
        await storageArea.set({
          [accountKey]: result[STORAGE_STATE_KEY],
          [STORAGE_LEGACY_OWNER_KEY]: resolved
        });
      }
    }
  } catch (error) {
    if (!isExtensionContextInvalidated(error)) {
      throw error;
    }
  }
  return resolved;
}

export async function loadLegacyBackupState(
  storageArea = getChromeStorageArea()
): Promise<ExtensionState | undefined> {
  if (!storageArea) {
    return undefined;
  }
  try {
    const result = await storageArea.get(STORAGE_STATE_KEY);
    const state = result[STORAGE_STATE_KEY];
    return isExtensionState(state) ? state : undefined;
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Copy the pre-account (legacy) backup into the currently active account and
 * mark that account as the legacy owner. Used to recover when the wrong
 * account adopted the data during the per-account migration.
 */
export async function restoreLegacyBackup(
  storageArea = getChromeStorageArea()
): Promise<ExtensionState | undefined> {
  if (!storageArea || activeAccountId === DEFAULT_ACCOUNT_ID) {
    return undefined;
  }
  const backup = await loadLegacyBackupState(storageArea);
  if (!backup) {
    return undefined;
  }
  try {
    await storageArea.set({
      [activeStateStorageKey()]: backup,
      [STORAGE_LEGACY_OWNER_KEY]: activeAccountId
    });
  } catch (error) {
    if (!isExtensionContextInvalidated(error)) {
      throw error;
    }
  }
  return backup;
}

export async function loadActiveAccountId(storageArea = getChromeStorageArea()): Promise<string> {
  if (!storageArea) {
    return DEFAULT_ACCOUNT_ID;
  }
  try {
    const result = await storageArea.get(STORAGE_ACTIVE_ACCOUNT_KEY);
    const value = result[STORAGE_ACTIVE_ACCOUNT_KEY];
    return typeof value === "string" && value.trim() ? value : DEFAULT_ACCOUNT_ID;
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      return DEFAULT_ACCOUNT_ID;
    }
    throw error;
  }
}

export async function updateState(
  updater: (state: ExtensionState) => ExtensionState | Promise<ExtensionState>,
  storageArea = getChromeStorageArea()
): Promise<ExtensionState> {
  const current = await loadState(storageArea);
  const next = await updater(current);
  await saveState(next, storageArea);
  return next;
}

export async function loadOrImportInitialState(
  storageArea = getChromeStorageArea(),
  legacyData: LegacyImportData = LEGACY_IMPORT_DATA
): Promise<ExtensionState> {
  const state = await loadState(storageArea);
  const imported = applyLegacyImportIfNeeded(state, legacyData);
  if (imported !== state) {
    await saveState(imported, storageArea);
  }
  return imported;
}
