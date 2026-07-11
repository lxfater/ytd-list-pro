import { describe, expect, it } from "vitest";
import {
  addCategory,
  applyFeedCheckResult,
  createEmptyState,
  mergeSubscriptions,
  moveChannels,
  toggleCategoryExpanded
} from "../shared/state";
import { UNCATEGORIZED_ID } from "../shared/constants";
import { buildSidebarSections, renderSidebar } from "./sidebar";

describe("buildSidebarSections", () => {
  it("returns uncategorized first and then ordered user categories with channel counts", () => {
    let state = createEmptyState();
    state = mergeSubscriptions(
      state,
      [
        { id: "UC-a", name: "A", url: "https://www.youtube.com/channel/UC-a" },
        { id: "UC-b", name: "B", url: "https://www.youtube.com/channel/UC-b" }
      ],
      1
    );
    state = addCategory(state, { id: "cat-code", name: "Code", color: "#22c55e", icon: "code" });
    state = moveChannels(state, ["UC-a"], "cat-code");
    state = toggleCategoryExpanded(state, UNCATEGORIZED_ID);

    const sections = buildSidebarSections(state);

    expect(sections.map((section) => [section.id, section.count, section.expanded])).toEqual([
      [UNCATEGORIZED_ID, 1, false],
      ["cat-code", 1, false]
    ]);
    expect(sections[1]?.channels.map((channel) => channel.name)).toEqual(["A"]);
  });

  it("renders chevrons as icons instead of visible text glyphs", () => {
    const state = createEmptyState();
    const root = document.createElement("div");

    renderSidebar(root, state, {
      onModeChange: () => undefined,
      onOpenChannel: () => undefined,
      onOpenManager: () => undefined,
      onToggleCategory: () => undefined
    });

    const chevron = root.querySelector(".ytdlp-section-chevron");

    expect(chevron?.textContent).toBe("");
    expect(chevron?.classList.contains("is-expanded")).toBe(true);
  });

  it("renders the saved category icon as an svg in the YouTube sidebar", () => {
    let state = createEmptyState();
    state = addCategory(state, { id: "cat-music", name: "Music", color: "#8b5cf6", icon: "music" });
    const root = document.createElement("div");

    renderSidebar(root, state, {
      onModeChange: () => undefined,
      onOpenChannel: () => undefined,
      onOpenManager: () => undefined,
      onToggleCategory: () => undefined
    });

    const musicSection = Array.from(root.querySelectorAll<HTMLElement>(".ytdlp-section")).find((section) =>
      section.textContent?.includes("Music")
    );

    expect(musicSection?.querySelector('svg[data-icon="music"]')).toBeTruthy();
    expect(musicSection?.querySelector(".ytdlp-section-icon")?.textContent).toBe("");
  });

  it("renders a YouTube sidebar management entry", () => {
    const state = createEmptyState();
    const root = document.createElement("div");
    let opened = false;

    renderSidebar(root, state, {
      onModeChange: () => undefined,
      onOpenChannel: () => undefined,
      onOpenManager: () => {
        opened = true;
      },
      onToggleCategory: () => undefined
    });

    const button = root.querySelector<HTMLButtonElement>(".ytdlp-sidebar-manage");

    expect(button?.textContent).toContain("管理");
    button?.click();
    expect(opened).toBe(true);
  });

  it("shows a dot only on channels with an unseen new video", () => {
    let state = createEmptyState();
    state = mergeSubscriptions(
      state,
      [
        { id: "UC-a", name: "Has update", url: "https://www.youtube.com/channel/UC-a" },
        { id: "UC-b", name: "No update", url: "https://www.youtube.com/channel/UC-b" }
      ],
      1
    );
    // UC-a: seen an older video, then a newer one appeared -> should show a dot.
    state = applyFeedCheckResult(state, "UC-a", 100, 200);
    state = applyFeedCheckResult(state, "UC-a", 300, 400);
    // UC-b: first-ever check only -> baseline, no dot yet.
    state = applyFeedCheckResult(state, "UC-b", 100, 200);
    // UNCATEGORIZED_ID starts expanded in a fresh state; no toggle needed.

    const root = document.createElement("div");
    renderSidebar(root, state, {
      onModeChange: () => undefined,
      onOpenChannel: () => undefined,
      onOpenManager: () => undefined,
      onToggleCategory: () => undefined
    });

    const channelButtons = Array.from(root.querySelectorAll<HTMLButtonElement>(".ytdlp-channel"));
    const updated = channelButtons.find((button) => button.title.includes("Has update"));
    const upToDate = channelButtons.find((button) => button.title.includes("No update"));

    expect(updated?.querySelector(".ytdlp-channel-dot")).toBeTruthy();
    expect(updated?.title).toContain("有新视频");
    expect(upToDate?.querySelector(".ytdlp-channel-dot")).toBeFalsy();
  });
});
