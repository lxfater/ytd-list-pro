import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addCategory, createEmptyState } from "../shared/state";
import { createMemoryStorageArea, STORAGE_STATE_KEY } from "../shared/storage";
import type { ExtensionState } from "../shared/types";
import { App } from "./App";

type StorageChangeListener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void;

const setChromeStorage = (state: ExtensionState) => {
  const storageArea = createMemoryStorageArea({ [STORAGE_STATE_KEY]: state });
  const listeners = new Set<StorageChangeListener>();

  globalThis.chrome = {
    storage: {
      local: storageArea,
      onChanged: {
        addListener: (listener: StorageChangeListener) => listeners.add(listener),
        removeListener: (listener: StorageChangeListener) => listeners.delete(listener)
      }
    },
    runtime: {
      sendMessage: vi.fn()
    },
    tabs: {
      query: vi.fn()
    }
  } as unknown as typeof chrome;
};

const renderPopup = async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
  await act(async () => {
    await Promise.resolve();
  });

  return { container, root };
};

const getStoredState = async (): Promise<ExtensionState> => {
  const result = await chrome.storage.local.get(STORAGE_STATE_KEY);
  return result[STORAGE_STATE_KEY] as ExtensionState;
};

describe("popup category editing", () => {
  let root: Root | undefined;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.replaceChildren();
    let state = createEmptyState();
    state.importedLegacyData = true;
    state = addCategory(state, { id: "cat-work", name: "Work", color: "#22c55e", icon: "code" });
    setChromeStorage(state);
  });

  afterEach(() => {
    root?.unmount();
    root = undefined;
    vi.restoreAllMocks();
  });

  it("keeps category rows read-only until the edit action opens a focused editor", async () => {
    const rendered = await renderPopup();
    root = rendered.root;

    expect(document.querySelector(".category-row input")).toBeNull();

    const workRow = Array.from(document.querySelectorAll<HTMLElement>(".category-row")).find((row) =>
      row.textContent?.includes("Work")
    );
    expect(workRow).toBeDefined();

    await act(async () => {
      workRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.querySelector(".category-editor")).toBeNull();

    const editButton = workRow?.querySelector<HTMLButtonElement>('[title="编辑分类"]');
    expect(editButton).toBeDefined();

    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const editorInput = document.querySelector<HTMLInputElement>('.category-editor input[name="category-name"]');
    expect(editorInput?.value).toBe("Work");
    expect(document.activeElement).toBe(editorInput);
  });

  it("keeps icon changes as a draft until the editor is saved", async () => {
    const rendered = await renderPopup();
    root = rendered.root;

    const workRow = Array.from(document.querySelectorAll<HTMLElement>(".category-row")).find((row) =>
      row.textContent?.includes("Work")
    );
    const editButton = workRow?.querySelector<HTMLButtonElement>('[title="编辑分类"]');
    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const musicIcon = document.querySelector<HTMLButtonElement>('.category-editor button[title="音乐"]');
    await act(async () => {
      musicIcon?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect((await getStoredState()).categories["cat-work"]?.icon).toBe("code");

    const saveButton = document.querySelector<HTMLButtonElement>(".category-editor .primary-button");
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect((await getStoredState()).categories["cat-work"]?.icon).toBe("music");
  });

  it("keeps the custom color picker separate from preset color swatches", async () => {
    const rendered = await renderPopup();
    root = rendered.root;

    const workRow = Array.from(document.querySelectorAll<HTMLElement>(".category-row")).find((row) =>
      row.textContent?.includes("Work")
    );
    const editButton = workRow?.querySelector<HTMLButtonElement>('[title="编辑分类"]');
    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.querySelector(".color-grid .custom-color")).toBeNull();
    expect(document.querySelector('.custom-color-row input[type="color"]')).toBeTruthy();
  });
});
