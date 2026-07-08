import { afterEach, describe, expect, it, vi } from "vitest";
import { addCategory, createEmptyState } from "./state";
import type { LegacyImportData } from "./types";
import {
  activateAccount,
  configureStorageAccount,
  createMemoryStorageArea,
  DEFAULT_ACCOUNT_ID,
  isExtensionContextInvalidated,
  loadActiveAccountId,
  loadOrImportInitialState,
  loadState,
  restoreLegacyBackup,
  saveState,
  STORAGE_STATE_KEY,
  updateState
} from "./storage";

const sampleLegacyData: LegacyImportData = {
  channels: [
    {
      id: "UC-sample-a",
      name: "Sample Channel",
      avatarUrl: "https://img.youtube.test/sample.jpg",
      handle: "@sample",
      url: "https://www.youtube.com/@sample"
    }
  ],
  categories: [],
  uncategorizedChannelIds: ["UC-sample-a"]
};

describe("storage helpers", () => {
  it("loads an empty state when storage has not been initialized", async () => {
    const storage = createMemoryStorageArea();
    const state = await loadState(storage);

    expect(state.categoryOrder).toEqual([]);
    expect(state.importedLegacyData).toBe(false);
  });

  it("saves and updates state through one storage key", async () => {
    const storage = createMemoryStorageArea();
    const first = addCategory(createEmptyState(), {
      id: "cat-news",
      name: "News",
      color: "#0ea5e9",
      icon: "channel"
    });

    await saveState(first, storage);
    const next = await updateState((state) => ({ ...state, importedLegacyData: true }), storage);

    expect(next.importedLegacyData).toBe(true);
    expect((await loadState(storage)).categoryOrder).toEqual(["cat-news"]);
  });

  it("imports legacy data once when loading initial state", async () => {
    const storage = createMemoryStorageArea();

    const imported = await loadOrImportInitialState(storage, sampleLegacyData);
    const second = await loadOrImportInitialState(storage, sampleLegacyData);

    expect(Object.keys(imported.channels)).toHaveLength(1);
    expect(imported.importedLegacyData).toBe(true);
    expect(second).toEqual(imported);
  });

  it("identifies extension context invalidation errors", () => {
    expect(isExtensionContextInvalidated(new Error("Extension context invalidated."))).toBe(true);
    expect(isExtensionContextInvalidated({ message: "Extension context invalidated" })).toBe(true);
    expect(isExtensionContextInvalidated(new Error("Other failure"))).toBe(false);
  });

  it("returns fallback state when extension context disappears during load", async () => {
    const storage = {
      get: vi.fn().mockRejectedValue(new Error("Extension context invalidated.")),
      set: vi.fn()
    };

    await expect(loadState(storage)).resolves.toEqual(createEmptyState());
  });
});

describe("per-account storage", () => {
  afterEach(() => {
    configureStorageAccount(DEFAULT_ACCOUNT_ID);
  });

  const legacyState = () =>
    addCategory(createEmptyState(), { id: "cat-old", name: "Old", color: "#0ea5e9", icon: "channel" });

  it("keeps the legacy key when no account is detected", async () => {
    const storage = createMemoryStorageArea();
    await activateAccount(undefined, storage);
    await saveState(legacyState(), storage);
    const raw = await storage.get(STORAGE_STATE_KEY);
    expect(raw[STORAGE_STATE_KEY]).toBeDefined();
  });

  it("lets the first detected account adopt legacy data and keeps a backup", async () => {
    const storage = createMemoryStorageArea({ [STORAGE_STATE_KEY]: legacyState() });
    await activateAccount("acc-1", storage);
    const state = await loadState(storage);
    expect(state.categoryOrder).toEqual(["cat-old"]);
    const raw = await storage.get(STORAGE_STATE_KEY);
    expect(raw[STORAGE_STATE_KEY]).toBeDefined();
  });

  it("isolates accounts: a second account starts empty and writes do not leak", async () => {
    const storage = createMemoryStorageArea({ [STORAGE_STATE_KEY]: legacyState() });
    await activateAccount("acc-1", storage);
    await updateState(
      (state) => addCategory(state, { id: "cat-a1", name: "A1", color: "#111", icon: "default" }),
      storage
    );

    await activateAccount("acc-2", storage);
    const second = await loadState(storage);
    expect(second.categoryOrder).toEqual([]);
    await updateState(
      (state) => addCategory(state, { id: "cat-b1", name: "B1", color: "#222", icon: "default" }),
      storage
    );

    await activateAccount("acc-1", storage);
    const first = await loadState(storage);
    expect(first.categoryOrder).toEqual(["cat-old", "cat-a1"]);
  });

  it("remembers the most recently active account for the popup", async () => {
    const storage = createMemoryStorageArea();
    await activateAccount("acc-9", storage);
    expect(await loadActiveAccountId(storage)).toBe("acc-9");
  });

  it("restores the legacy backup into the current account on demand", async () => {
    const storage = createMemoryStorageArea({ [STORAGE_STATE_KEY]: legacyState() });
    // acc-1 adopted the legacy data during migration...
    await activateAccount("acc-1", storage);
    // ...but the data really belongs to acc-2, which starts empty.
    await activateAccount("acc-2", storage);
    expect((await loadState(storage)).categoryOrder).toEqual([]);

    const restored = await restoreLegacyBackup(storage);
    expect(restored?.categoryOrder).toEqual(["cat-old"]);
    expect((await loadState(storage)).categoryOrder).toEqual(["cat-old"]);
  });

  it("does not restore anything for the default account or without a backup", async () => {
    const empty = createMemoryStorageArea();
    await activateAccount("acc-1", empty);
    expect(await restoreLegacyBackup(empty)).toBeUndefined();

    const withBackup = createMemoryStorageArea({ [STORAGE_STATE_KEY]: legacyState() });
    await activateAccount(undefined, withBackup);
    expect(await restoreLegacyBackup(withBackup)).toBeUndefined();
  });
});
