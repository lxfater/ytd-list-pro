import { describe, expect, it, vi } from "vitest";
import { addCategory, createEmptyState, mergeSubscriptions, moveChannels } from "../shared/state";
import { findQuickAddAnchor, readPageChannel, renderQuickAdd } from "./quick-add";

const createState = () => {
  let state = createEmptyState();
  state = mergeSubscriptions(
    state,
    [
      {
        id: "UC-a",
        name: "Alpha Channel",
        handle: "@alpha",
        url: "https://www.youtube.com/@alpha"
      },
      {
        id: "UC-b",
        name: "Beta Channel",
        handle: "@beta",
        url: "https://www.youtube.com/@beta"
      }
    ],
    1
  );
  state = addCategory(state, { id: "cat-ai", name: "AI", color: "#7c3aed", icon: "ai" });
  state = moveChannels(state, ["UC-a"], "cat-ai");
  return state;
};

const handlers = () => ({
  onAssign: vi.fn(),
  onOpenManager: vi.fn()
});

const watchPageDom = () => {
  const host = document.createElement("div");
  host.innerHTML = `
    <ytd-watch-metadata>
      <div id="owner">
        <a href="/@alpha"><img src="https://yt3.googleusercontent.com/x=s88-c" /></a>
        <div id="channel-name">Alpha Channel</div>
        <div id="subscribe-button"></div>
      </div>
    </ytd-watch-metadata>
  `;
  return host;
};

describe("readPageChannel", () => {
  it("reads the channel from a watch page owner section", () => {
    const channel = readPageChannel(watchPageDom(), "/watch");
    expect(channel?.id).toBe("handle:alpha");
    expect(channel?.handle).toBe("@alpha");
    expect(channel?.name).toBe("Alpha Channel");
    expect(channel?.url).toBe("https://www.youtube.com/@alpha");
  });

  it("reads the channel from a channel page header", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <yt-page-header-renderer>
        <h1>Beta Channel</h1>
        <yt-flexible-actions-view-model></yt-flexible-actions-view-model>
      </yt-page-header-renderer>
    `;
    const channel = readPageChannel(host, "/@beta/videos");
    expect(channel?.id).toBe("handle:beta");
    expect(channel?.name).toBe("Beta Channel");
  });

  it("returns nothing on unrelated pages", () => {
    const host = document.createElement("div");
    host.innerHTML = "<div>feed</div>";
    expect(readPageChannel(host, "/feed/subscriptions")).toBeUndefined();
  });
});

describe("findQuickAddAnchor", () => {
  it("anchors next to the watch page owner section", () => {
    const host = watchPageDom();
    expect(findQuickAddAnchor(host)?.id).toBe("owner");
  });

  it("anchors in the channel header actions", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <yt-page-header-renderer>
        <yt-flexible-actions-view-model></yt-flexible-actions-view-model>
      </yt-page-header-renderer>
    `;
    expect(findQuickAddAnchor(host)?.tagName.toLowerCase()).toBe("yt-flexible-actions-view-model");
  });
});

describe("renderQuickAdd", () => {
  const pageChannel = {
    id: "handle:alpha",
    name: "Alpha Channel",
    handle: "@alpha",
    url: "https://www.youtube.com/@alpha"
  };

  it("shows the assigned category on the button when the channel is categorized", () => {
    const root = document.createElement("div");
    renderQuickAdd(root, createState(), pageChannel, handlers());
    expect(root.querySelector(".ytdlp-quick-add-button")?.textContent).toContain("AI");
    expect(root.querySelector(".ytdlp-quick-add-button.is-assigned")).toBeTruthy();
  });

  it("offers to join a category for unknown channels", () => {
    const root = document.createElement("div");
    renderQuickAdd(
      root,
      createState(),
      { id: "handle:new", name: "New Channel", handle: "@new", url: "https://www.youtube.com/@new" },
      handlers()
    );
    expect(root.querySelector(".ytdlp-quick-add-button")?.textContent).toContain("加入分类");
  });

  it("assigns the channel to the clicked category", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const quickAddHandlers = handlers();
    renderQuickAdd(root, createState(), pageChannel, quickAddHandlers);

    root.querySelector<HTMLButtonElement>(".ytdlp-quick-add-button")?.click();
    const menu = root.querySelector<HTMLElement>(".ytdlp-quick-add-menu");
    expect(menu?.hidden).toBe(false);

    const uncategorizedItem = Array.from(root.querySelectorAll<HTMLButtonElement>(".ytdlp-quick-add-item")).find(
      (item) => item.textContent?.includes("未分类")
    );
    uncategorizedItem?.click();
    expect(quickAddHandlers.onAssign).toHaveBeenCalledWith(pageChannel, expect.any(String));
    root.remove();
  });

  it("marks the current category and opens the manager from the menu", () => {
    const root = document.createElement("div");
    const quickAddHandlers = handlers();
    renderQuickAdd(root, createState(), pageChannel, quickAddHandlers);

    const current = root.querySelector(".ytdlp-quick-add-item.is-current");
    expect(current?.textContent).toContain("AI");

    root.querySelector<HTMLButtonElement>(".ytdlp-quick-add-item.is-manage")?.click();
    expect(quickAddHandlers.onOpenManager).toHaveBeenCalled();
  });
});
