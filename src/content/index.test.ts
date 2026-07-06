import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGE_TYPES } from "../shared/messages";
import { addCategory, createEmptyState } from "../shared/state";
import type { ExtensionState } from "../shared/types";

const setupChrome = () => {
  let messageListener:
    | ((message: { type?: string }, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => boolean)
    | undefined;

  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: {
        addListener: vi.fn((listener) => {
          messageListener = listener;
        }),
        removeListener: vi.fn()
      }
    },
    storage: {
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    }
  });

  return {
    sendMessage(message: { type?: string }) {
      messageListener?.(message, {}, () => undefined);
    }
  };
};

const importContentScript = async (initialState: ExtensionState = createEmptyState()) => {
  let state = initialState;
  vi.doMock("../shared/storage", async () => {
    const actual = await vi.importActual<typeof import("../shared/storage")>("../shared/storage");
    return {
      ...actual,
      loadOrImportInitialState: vi.fn(async () => state),
      updateState: vi.fn(async (updater) => {
        state = updater(state);
        return state;
      })
    };
  });

  await import("./index");
};

const flushMountCycle = async () => {
  await vi.advanceTimersByTimeAsync(300);
  await Promise.resolve();
};

describe("content script sidebar mounting", () => {
  let chromeHarness: ReturnType<typeof setupChrome>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    document.body.replaceChildren();
    document.head.replaceChildren();
    chromeHarness = setupChrome();
  });

  afterEach(() => {
    (window as Window & { __YTDLP_CLEANUP__?: () => void }).__YTDLP_CLEANUP__?.();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("mounts the categorized sidebar when YouTube creates the guide after startup", async () => {
    await importContentScript();
    await flushMountCycle();

    expect(document.getElementById("ytdlp-sidebar-root")).toBeNull();

    document.body.innerHTML = `
      <ytd-guide-renderer>
        <div id="sections">
          <ytd-guide-section-renderer>订阅</ytd-guide-section-renderer>
        </div>
      </ytd-guide-renderer>
    `;
    await flushMountCycle();

    const root = document.getElementById("ytdlp-sidebar-root");
    expect(root).toBeInstanceOf(HTMLElement);
    expect(root?.textContent).toContain("管理");
  });

  it("moves the sidebar from YouTube mini guide into the full subscriptions guide when it appears", async () => {
    document.body.innerHTML = `<ytd-mini-guide-renderer></ytd-mini-guide-renderer>`;

    await importContentScript();
    await flushMountCycle();

    const root = document.getElementById("ytdlp-sidebar-root");
    expect(root?.parentElement?.tagName.toLowerCase()).toBe("ytd-mini-guide-renderer");

    document.body.insertAdjacentHTML(
      "afterbegin",
      `
        <ytd-guide-renderer>
          <div id="sections" data-testid="full-guide">
            <ytd-guide-section-renderer>订阅</ytd-guide-section-renderer>
          </div>
        </ytd-guide-renderer>
      `
    );
    await flushMountCycle();

    const fullGuide = document.querySelector<HTMLElement>('[data-testid="full-guide"]');
    expect(document.getElementById("ytdlp-sidebar-root")?.parentElement).toBe(fullGuide);
  });

  it("keeps the category name input mounted while typing in the editor", async () => {
    const state = addCategory(createEmptyState(), {
      id: "cat-ai",
      name: "AI",
      color: "#7c3aed",
      icon: "ai"
    });

    await importContentScript(state);
    chromeHarness.sendMessage({ type: MESSAGE_TYPES.OPEN_MANAGER });
    await flushMountCycle();

    document.querySelector<HTMLButtonElement>('[title="编辑分类"]')?.click();
    await vi.advanceTimersByTimeAsync(0);
    const input = document.querySelector<HTMLInputElement>('input[name="category-name"]');
    expect(input).toBeInstanceOf(HTMLInputElement);

    input!.value = "AI Lab";
    input!.dispatchEvent(new Event("input", { bubbles: true }));

    expect(document.querySelector<HTMLInputElement>('input[name="category-name"]')).toBe(input);
    expect(input!.value).toBe("AI Lab");
  });
});
