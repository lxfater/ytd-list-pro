import { describe, expect, it, vi } from "vitest";
import { addCategory, createEmptyState, mergeSubscriptions, moveChannels } from "../shared/state";
import { UNCATEGORIZED_ID } from "../shared/constants";
import type { CategoryDraft, ManagerUiState } from "./manager";
import { renderManager } from "./manager";

const createState = () => {
  let state = createEmptyState();
  state = mergeSubscriptions(
    state,
    [
      {
        id: "UC-a",
        name: "Alpha Channel",
        handle: "@alpha",
        avatarUrl: "https://yt3.googleusercontent.com/a=s88-c",
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

const createSortableState = () => {
  let state = createEmptyState();
  state = mergeSubscriptions(
    state,
    [
      {
        id: "UC-old",
        name: "Old Channel",
        handle: "@old",
        url: "https://www.youtube.com/@old"
      }
    ],
    10
  );
  state = mergeSubscriptions(
    state,
    [
      {
        id: "UC-old",
        name: "Old Channel",
        handle: "@old",
        url: "https://www.youtube.com/@old"
      },
      {
        id: "UC-new",
        name: "New Channel",
        handle: "@new",
        url: "https://www.youtube.com/@new"
      }
    ],
    20
  );
  state = addCategory(state, { id: "cat-review", name: "Review", color: "#0f0f0f", icon: "channel" });
  state = moveChannels(state, ["UC-old", "UC-new"], "cat-review");
  return state;
};

const baseUi = (overrides: Partial<ManagerUiState> = {}): ManagerUiState => ({
  selectedCategoryId: "cat-ai",
  selectedChannelIds: [],
  search: "",
  moveTargetId: UNCATEGORIZED_ID,
  sortMode: "added-desc",
  status: "准备就绪",
  ...overrides
});

const handlers = () => ({
  onClose: vi.fn(),
  onRefresh: vi.fn(),
  onCreateCategory: vi.fn(),
  onSelectCategory: vi.fn(),
  onEditCategory: vi.fn(),
  onDeleteCategory: vi.fn(),
  onSearch: vi.fn(),
  onToggleChannel: vi.fn(),
  onSelectAll: vi.fn(),
  onClearSelected: vi.fn(),
  onMoveTargetChange: vi.fn(),
  onMoveSelected: vi.fn(),
  onExport: vi.fn(),
  onImport: vi.fn(),
  onRestoreLegacy: vi.fn(),
  onOpenChannel: vi.fn(),
  onSortChange: vi.fn(),
  onDragCategoryStart: vi.fn(),
  onDropOnCategory: vi.fn(),
  onDragChannelStart: vi.fn(),
  onDraftChange: vi.fn(),
  onDraftSave: vi.fn(),
  onDraftCancel: vi.fn()
});

describe("renderManager", () => {
  it("shows a legacy-restore banner only when recovery is possible", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(root, createState(), baseUi({ canRestoreLegacy: true }), managerHandlers);
    const restore = root.querySelector<HTMLButtonElement>(".ytdlp-manager-restore-button");
    expect(restore?.textContent).toBe("恢复旧数据");
    restore?.click();
    expect(managerHandlers.onRestoreLegacy).toHaveBeenCalled();

    renderManager(root, createState(), baseUi(), managerHandlers);
    expect(root.querySelector(".ytdlp-manager-restore")).toBeNull();
  });

  it("renders category and channel management inside a YouTube drawer", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(root, createState(), baseUi(), managerHandlers);

    expect(root.querySelector(".ytdlp-manager-drawer")).toBeTruthy();
    expect(root.querySelector(".ytdlp-manager-category.is-active")?.textContent).toContain("AI");
    expect(root.querySelector(".ytdlp-manager-channel")?.textContent).toContain("Alpha Channel");
    expect(root.querySelector(".ytdlp-manager-refresh")?.textContent).toContain("刷新频道");
  });

  it("does not render a redundant drawer title bar or close button", () => {
    const root = document.createElement("div");

    renderManager(root, createState(), baseUi(), handlers());

    expect(root.querySelector(".ytdlp-manager-header")).toBeNull();
    expect(root.textContent).not.toContain("YTD List Pro");
    expect(root.querySelector('[title="关闭"]')).toBeNull();
  });

  it("keeps category editing inside the YouTube manager drawer", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(root, createState(), baseUi(), managerHandlers);
    root.querySelector<HTMLButtonElement>('[title="编辑分类"]')?.click();

    expect(managerHandlers.onEditCategory).toHaveBeenCalledWith("cat-ai");
  });

  it("uses an external-link icon for opening a channel", () => {
    const root = document.createElement("div");

    renderManager(root, createState(), baseUi(), handlers());

    expect(root.querySelector('[title="打开频道"] svg[data-icon="external"]')).toBeTruthy();
  });

  it("sorts channels by newest subscription discovery first", () => {
    const root = document.createElement("div");

    renderManager(root, createSortableState(), baseUi({ selectedCategoryId: "cat-review" }), handlers());

    const names = Array.from(root.querySelectorAll(".ytdlp-manager-channel strong")).map((item) => item.textContent);
    expect(names).toEqual(["New Channel", "Old Channel"]);
  });

  it("lets the user change the channel sort mode", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(root, createState(), baseUi(), managerHandlers);
    const sort = root.querySelector<HTMLSelectElement>(".ytdlp-manager-sort");
    expect(sort?.value).toBe("added-desc");

    sort!.value = "name-asc";
    sort!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(managerHandlers.onSortChange).toHaveBeenCalledWith("name-asc");
  });

  it("renders the category draft editor with focused controls", () => {
    const root = document.createElement("div");
    const draft: CategoryDraft = {
      mode: "edit",
      id: "cat-ai",
      name: "AI",
      color: "#7c3aed",
      icon: "ai"
    };

    renderManager(root, createState(), baseUi({ draft }), handlers());

    expect(root.querySelector(".ytdlp-manager-editor")).toBeTruthy();
    expect(root.querySelector<HTMLInputElement>('input[name="category-name"]')?.value).toBe("AI");
    expect(root.querySelector('button[data-icon-choice="ai"]')?.classList.contains("is-active")).toBe(true);
  });

  it("closes the drawer from the blank overlay without closing on drawer clicks", () => {
    const root = document.createElement("div");
    const managerHandlers = handlers();

    renderManager(root, createState(), baseUi(), managerHandlers);

    root.querySelector<HTMLElement>(".ytdlp-manager-drawer")?.click();
    expect(managerHandlers.onClose).not.toHaveBeenCalled();

    root.querySelector<HTMLElement>(".ytdlp-manager-shell")?.click();
    expect(managerHandlers.onClose).toHaveBeenCalledTimes(1);
  });
});
