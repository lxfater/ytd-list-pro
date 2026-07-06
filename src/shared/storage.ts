import { LEGACY_IMPORT_DATA } from "./legacy-data";
import { applyLegacyImportIfNeeded, createEmptyState } from "./state";
import type { ExtensionState, LegacyImportData } from "./types";

export const STORAGE_STATE_KEY = "ytdListProState";

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
    const result = await storageArea.get(STORAGE_STATE_KEY);
    const state = result[STORAGE_STATE_KEY];
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
    await storageArea.set({ [STORAGE_STATE_KEY]: state });
    return state;
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      return state;
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
