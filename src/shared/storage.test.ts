import { describe, expect, it, vi } from "vitest";
import { addCategory, createEmptyState } from "./state";
import type { LegacyImportData } from "./types";
import {
  createMemoryStorageArea,
  isExtensionContextInvalidated,
  loadOrImportInitialState,
  loadState,
  saveState,
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
