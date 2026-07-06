import { afterEach, describe, expect, it, vi } from "vitest";
import { MESSAGE_TYPES } from "../shared/messages";

type TabUpdatedListener = (tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => void;

const setupChrome = () => {
  let updatedListener: TabUpdatedListener | undefined;
  const chromeMock = {
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() }
    },
    action: {
      onClicked: { addListener: vi.fn() }
    },
    tabs: {
      create: vi.fn().mockResolvedValue({ id: 77, status: "loading", url: "https://www.youtube.com/" }),
      sendMessage: vi.fn().mockResolvedValue({ ok: true }),
      onUpdated: {
        addListener: vi.fn((listener: TabUpdatedListener) => {
          updatedListener = listener;
        }),
        removeListener: vi.fn()
      }
    },
    scripting: {
      executeScript: vi.fn().mockResolvedValue([])
    }
  };

  vi.stubGlobal("chrome", chromeMock);

  return {
    chromeMock,
    getUpdatedListener: () => updatedListener
  };
};

describe("background action", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens YouTube first and shows the manager when the new tab finishes loading", async () => {
    const { chromeMock, getUpdatedListener } = setupChrome();
    vi.doMock("../shared/storage", () => ({
      loadOrImportInitialState: vi.fn().mockResolvedValue(undefined)
    }));
    vi.doMock("./avatar-proxy", () => ({
      fetchAvatarDataUrl: vi.fn()
    }));

    const { openManagerInTab } = await import("./index");
    await openManagerInTab({ id: 1, url: "https://example.com/" } as chrome.tabs.Tab);

    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: "https://www.youtube.com/" });
    expect(chromeMock.tabs.onUpdated.addListener).toHaveBeenCalledTimes(1);

    const listener = getUpdatedListener();
    expect(listener).toBeDefined();
    listener?.(77, { status: "complete" }, { id: 77, url: "https://www.youtube.com/" } as chrome.tabs.Tab);

    expect(chromeMock.tabs.onUpdated.removeListener).toHaveBeenCalledWith(listener);
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(77, { type: MESSAGE_TYPES.OPEN_MANAGER });
  });

  it("sends the manager message directly when the active tab is YouTube", async () => {
    const { chromeMock } = setupChrome();
    vi.doMock("../shared/storage", () => ({
      loadOrImportInitialState: vi.fn().mockResolvedValue(undefined)
    }));
    vi.doMock("./avatar-proxy", () => ({
      fetchAvatarDataUrl: vi.fn()
    }));

    const { openManagerInTab } = await import("./index");
    await openManagerInTab({ id: 88, url: "https://www.youtube.com/feed/subscriptions" } as chrome.tabs.Tab);

    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(88, { type: MESSAGE_TYPES.OPEN_MANAGER });
  });
});
