import { MESSAGE_TYPES, type CollectSubscriptionsResponse } from "../shared/messages";
import {
  addCategory,
  deleteCategory,
  getChannelsForCategory,
  importChannelsToCategories,
  markChannelSeen,
  mergeSubscriptions,
  moveChannels,
  renameCategory,
  reorderCategories,
  searchAllChannels,
  setCategoryAppearance,
  setSidebarMode,
  toggleCategoryExpanded,
  upsertChannelToCategory
} from "../shared/state";
import {
  activateAccount,
  activeStateStorageKey,
  DEFAULT_ACCOUNT_ID,
  isExtensionContextInvalidated,
  loadOrImportInitialState,
  updateState
} from "../shared/storage";
import type { Channel, ChannelSortMode, ExtensionState, SidebarMode } from "../shared/types";
import { PRESET_COLORS, UNCATEGORIZED_ID } from "../shared/constants";
import { buildCategoriesCsv, parseCategoriesCsv } from "../shared/transfer";
import { parseSubscriptionsFromDocument } from "../shared/youtube-parser";
import { type CategoryDraft, MANAGER_STYLES, type ManagerUiState, renderManager } from "./manager";
import {
  findQuickAddAnchor,
  QUICK_ADD_ROOT_ID,
  QUICK_ADD_STYLES,
  quickAddSignature,
  readPageChannel,
  renderQuickAdd
} from "./quick-add";
import { renderSidebar, SIDEBAR_STYLES } from "./sidebar";
import { readSubscriptionsFromPageSession } from "./session-bridge";

const ROOT_ID = "ytdlp-sidebar-root";
const MANAGER_ROOT_ID = "ytdlp-manager-root";
const STYLE_ID = "ytdlp-sidebar-style";
const CLEANUP_KEY = "__YTDLP_CLEANUP__";

type CleanupWindow = Window & {
  [CLEANUP_KEY]?: () => void;
};

let currentState: ExtensionState | undefined;
let originalSubscriptionsSection: HTMLElement | undefined;
let mountTimer: number | undefined;
let guideObserver: MutationObserver | undefined;
let managerOpen = false;
let draggedCategoryId: string | undefined;
let quickAddTimer: number | undefined;
let activatedAccountId: string | undefined;

// YouTube exposes a per-account DATASYNC_ID in inline page config; switching
// accounts always reloads the page, so one successful detection is stable for
// the lifetime of this content script.
const detectYouTubeAccountId = (): string | undefined => {
  for (const script of Array.from(document.scripts)) {
    const text = script.textContent;
    if (!text || !text.includes("DATASYNC_ID")) {
      continue;
    }
    const match = text.match(/"DATASYNC_ID"\s*:\s*"([^"|]+)/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
};

const ensureAccountActive = async () => {
  const found = detectYouTubeAccountId();
  if (found === undefined && activatedAccountId !== undefined) {
    return;
  }
  const target = found ?? DEFAULT_ACCOUNT_ID;
  if (activatedAccountId === target) {
    return;
  }
  activatedAccountId = target;
  await activateAccount(target);
};
let managerUi: ManagerUiState = {
  selectedCategoryId: UNCATEGORIZED_ID,
  selectedChannelIds: [],
  search: "",
  moveTargetId: UNCATEGORIZED_ID,
  sortMode: "added-desc",
  status: "准备就绪"
};

const safeAsync = async <T>(operation: () => Promise<T>, fallback?: T): Promise<T | undefined> => {
  try {
    return await operation();
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      return fallback;
    }
    console.warn("[YTD List Pro]", error);
    return fallback;
  }
};

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `${SIDEBAR_STYLES}\n${MANAGER_STYLES}\n${QUICK_ADD_STYLES}`;
  document.head.append(style);
};

const findGuideContainer = (): HTMLElement | undefined => {
  const selectors = [
    "ytd-guide-renderer #sections",
    "#guide-content #sections",
    "tp-yt-app-drawer #sections",
    "ytd-mini-guide-renderer"
  ];
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) {
      return element;
    }
  }
  return undefined;
};

const findSubscriptionsSection = (container: HTMLElement): HTMLElement | undefined => {
  const children = Array.from(container.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  return children.find((child) => /subscriptions|订阅/i.test(child.textContent ?? ""));
};

const placeSidebarRoot = (container: HTMLElement, root: HTMLElement) => {
  originalSubscriptionsSection = findSubscriptionsSection(container);
  if (originalSubscriptionsSection) {
    container.insertBefore(root, originalSubscriptionsSection);
  } else {
    container.prepend(root);
  }
};

const getOrCreateRoot = (container: HTMLElement): HTMLElement => {
  const existing = document.getElementById(ROOT_ID);
  if (existing instanceof HTMLElement) {
    if (existing.parentElement !== container) {
      placeSidebarRoot(container, existing);
    }
    return existing;
  }
  const root = document.createElement("div");
  root.id = ROOT_ID;
  placeSidebarRoot(container, root);
  return root;
};

const syncOriginalListVisibility = (state: ExtensionState) => {
  if (!originalSubscriptionsSection) {
    return;
  }
  originalSubscriptionsSection.style.display = state.ui.sidebarMode === "categorized" ? "none" : "";
};

const saveMode = (mode: SidebarMode) => {
  void safeAsync(async () => {
    currentState = await updateState((state) => setSidebarMode(state, mode));
    mountSidebar(currentState);
  });
};

const toggleSection = (categoryId: string) => {
  void safeAsync(async () => {
    currentState = await updateState((state) => toggleCategoryExpanded(state, categoryId));
    mountSidebar(currentState);
  });
};

const openChannel = (channel: Channel) => {
  // Fire-and-forget: clears the channel's "new video" dot. Not awaited
  // because the page is about to navigate away; chrome.storage.local.set is
  // dispatched to the browser process immediately regardless.
  void safeAsync(async () => {
    currentState = await updateState((state) => markChannelSeen(state, channel.id));
  });
  window.location.href = channel.url;
};

const makeCategoryId = () => `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const getOrCreateManagerRoot = (): HTMLElement => {
  const existing = document.getElementById(MANAGER_ROOT_ID);
  if (existing instanceof HTMLElement) {
    return existing;
  }
  const root = document.createElement("div");
  root.id = MANAGER_ROOT_ID;
  document.body.append(root);
  return root;
};

const categoryExists = (state: ExtensionState, categoryId: string): boolean =>
  categoryId === UNCATEGORIZED_ID || Boolean(state.categories[categoryId]);

const normalizeManagerUi = (state: ExtensionState) => {
  if (!categoryExists(state, managerUi.selectedCategoryId)) {
    managerUi.selectedCategoryId = UNCATEGORIZED_ID;
  }
  if (!categoryExists(state, managerUi.moveTargetId)) {
    managerUi.moveTargetId = UNCATEGORIZED_ID;
  }
  managerUi.selectedChannelIds = managerUi.selectedChannelIds.filter((id) => state.channels[id]);
};

const mountManager = (state: ExtensionState) => {
  if (!managerOpen) {
    return;
  }
  ensureStyles();
  normalizeManagerUi(state);
  renderManager(getOrCreateManagerRoot(), state, managerUi, managerHandlers);
};

const quickAddHandlers = {
  onAssign(channel: Channel, categoryId: string) {
    void safeAsync(async () => {
      currentState = await updateState((state) => upsertChannelToCategory(state, channel, categoryId));
      refreshViews(currentState);
    });
  },
  onOpenManager() {
    openManager();
  }
};

const mountQuickAdd = (state: ExtensionState) => {
  const anchor = findQuickAddAnchor();
  const pageChannel = anchor ? readPageChannel() : undefined;
  const existingRoot = document.getElementById(QUICK_ADD_ROOT_ID);
  if (!anchor || !pageChannel) {
    existingRoot?.remove();
    return;
  }
  const signature = quickAddSignature(state, pageChannel);
  let root = existingRoot instanceof HTMLElement ? existingRoot : undefined;
  if (root && root.parentElement === anchor && root.dataset.signature === signature) {
    return;
  }
  if (!root || root.parentElement !== anchor) {
    root?.remove();
    root = document.createElement("div");
    root.id = QUICK_ADD_ROOT_ID;
    anchor.append(root);
  }
  root.dataset.signature = signature;
  ensureStyles();
  renderQuickAdd(root, state, pageChannel, quickAddHandlers);
};

const scheduleQuickAddMount = () => {
  if (quickAddTimer !== undefined) {
    window.clearTimeout(quickAddTimer);
  }
  quickAddTimer = window.setTimeout(() => {
    quickAddTimer = undefined;
    if (currentState) {
      mountQuickAdd(currentState);
    }
  }, 300);
};

const refreshViews = (state: ExtensionState) => {
  mountSidebar(state);
  mountManager(state);
  mountQuickAdd(state);
};

const mountSidebar = (state: ExtensionState) => {
  const container = findGuideContainer();
  if (!container) {
    return;
  }
  ensureStyles();
  const root = getOrCreateRoot(container);
  syncOriginalListVisibility(state);
  renderSidebar(root, state, {
    onModeChange: saveMode,
    onToggleCategory: toggleSection,
    onOpenChannel: openChannel,
    onOpenManager: openManager
  });
};

const scheduleMount = () => {
  if (mountTimer !== undefined) {
    window.clearTimeout(mountTimer);
  }
  mountTimer = window.setTimeout(() => {
    void safeAsync(async () => {
      await ensureAccountActive();
      currentState = await loadOrImportInitialState();
      refreshViews(currentState);
    });
  }, 250);
};

const addGuideObserver = () => {
  guideObserver?.disconnect();
  guideObserver = new MutationObserver(() => {
    if (typeof document === "undefined") {
      return;
    }
    scheduleQuickAddMount();
    const container = findGuideContainer();
    const root = document.getElementById(ROOT_ID);
    if (!container || root?.parentElement === container) {
      return;
    }
    scheduleMount();
  });
  guideObserver.observe(document.documentElement, { childList: true, subtree: true });
  return () => {
    guideObserver?.disconnect();
    guideObserver = undefined;
  };
};

const collectAndSaveSubscriptions = async (): Promise<CollectSubscriptionsResponse> => {
  await ensureAccountActive();
  const sessionResult = await readSubscriptionsFromPageSession();
  if (!sessionResult.ok) {
    const visibleCount = parseSubscriptionsFromDocument(document).length;
    return {
      ok: false,
      error:
        visibleCount > 0
          ? `${sessionResult.error} 页面上只能看到 ${visibleCount} 个频道，未用这部分数据覆盖完整列表。`
          : sessionResult.error
    };
  }
  const channels = sessionResult.channels;
  const nextState = await updateState((state) => mergeSubscriptions(state, channels));
  currentState = nextState;
  refreshViews(nextState);
  return { ok: true, channels, source: "youtube-session" };
};

function openManager() {
  void safeAsync(async () => {
    await ensureAccountActive();
    currentState = currentState ?? (await loadOrImportInitialState());
    managerOpen = true;
    managerUi.status = "准备就绪";
    mountManager(currentState);
  });
}

const closeManager = () => {
  managerOpen = false;
  document.getElementById(MANAGER_ROOT_ID)?.remove();
};

const refreshFromManager = () => {
  void safeAsync(async () => {
    managerUi.status = "正在刷新订阅";
    if (currentState) {
      mountManager(currentState);
    }
    const response = await collectAndSaveSubscriptions();
    managerUi.selectedChannelIds = [];
    managerUi.status = response.ok
      ? `已通过 YouTube 登录态刷新 ${response.channels?.length ?? 0} 个频道`
      : response.error ?? "刷新失败";
    if (currentState) {
      mountManager(currentState);
    }
  });
};

const createCategoryFromManager = () => {
  if (!currentState) {
    return;
  }
  managerUi.draft = {
    mode: "create",
    id: makeCategoryId(),
    name: "新分类",
    color: PRESET_COLORS[currentState.categoryOrder.length % PRESET_COLORS.length],
    icon: "default"
  };
  mountManager(currentState);
};

const editCategoryFromManager = (categoryId: string) => {
  const category = currentState?.categories[categoryId];
  if (!currentState || !category || category.isSystem) {
    return;
  }
  managerUi.selectedCategoryId = categoryId;
  managerUi.draft = {
    mode: "edit",
    id: category.id,
    name: category.name,
    color: category.color,
    icon: category.icon
  };
  mountManager(currentState);
};

const deleteCategoryFromManager = (categoryId: string) => {
  if (!currentState || categoryId === UNCATEGORIZED_ID) {
    return;
  }
  void safeAsync(async () => {
    currentState = await updateState((state) => deleteCategory(state, categoryId));
    managerUi.selectedCategoryId = UNCATEGORIZED_ID;
    managerUi.selectedChannelIds = [];
    managerUi.draft = managerUi.draft?.id === categoryId ? undefined : managerUi.draft;
    refreshViews(currentState);
  });
};

const saveCategoryDraftFromManager = () => {
  if (!currentState || !managerUi.draft) {
    return;
  }
  const draft = managerUi.draft;
  void safeAsync(async () => {
    const name = draft.name.trim() || "新分类";
    currentState = await updateState((state) => {
      if (draft.mode === "create") {
        return addCategory(state, {
          id: draft.id,
          name,
          color: draft.color,
          icon: draft.icon
        });
      }
      const renamed = renameCategory(state, draft.id, name);
      return setCategoryAppearance(renamed, draft.id, {
        color: draft.color,
        icon: draft.icon
      });
    });
    managerUi.selectedCategoryId = draft.id;
    managerUi.draft = undefined;
    managerUi.status = "已保存分类";
    refreshViews(currentState);
  });
};

const getVisibleManagerChannels = (state: ExtensionState): Channel[] =>
  managerUi.search.trim()
    ? searchAllChannels(state, managerUi.search).map((hit) => hit.channel)
    : getChannelsForCategory(state, managerUi.selectedCategoryId);

const moveSelectedFromManager = () => {
  if (!currentState || managerUi.selectedChannelIds.length === 0) {
    return;
  }
  void safeAsync(async () => {
    currentState = await updateState((state) => moveChannels(state, managerUi.selectedChannelIds, managerUi.moveTargetId));
    managerUi.selectedChannelIds = [];
    refreshViews(currentState);
  });
};

const dropOnCategoryFromManager = (categoryId: string, event: DragEvent) => {
  event.preventDefault();
  if (!currentState) {
    return;
  }
  const channelId = event.dataTransfer?.getData("application/x-ytdlp-channel");
  if (channelId) {
    void safeAsync(async () => {
      currentState = await updateState((state) => moveChannels(state, [channelId], categoryId));
      managerUi.selectedChannelIds = [];
      refreshViews(currentState);
    });
    return;
  }

  const sourceCategoryId = draggedCategoryId || event.dataTransfer?.getData("application/x-ytdlp-category");
  if (!sourceCategoryId || sourceCategoryId === categoryId || sourceCategoryId === UNCATEGORIZED_ID) {
    return;
  }

  void safeAsync(async () => {
    currentState = await updateState((state) => {
      const nextOrder = [...state.categoryOrder];
      const sourceIndex = nextOrder.indexOf(sourceCategoryId);
      const targetIndex = nextOrder.indexOf(categoryId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return state;
      }
      nextOrder.splice(sourceIndex, 1);
      nextOrder.splice(targetIndex, 0, sourceCategoryId);
      return reorderCategories(state, nextOrder);
    });
    refreshViews(currentState);
  });
};

const managerHandlers = {
  onClose: closeManager,
  onRefresh: refreshFromManager,
  onCreateCategory: createCategoryFromManager,
  onSelectCategory(categoryId: string) {
    managerUi.selectedCategoryId = categoryId;
    managerUi.selectedChannelIds = [];
    managerUi.search = "";
    if (currentState) {
      mountManager(currentState);
    }
  },
  onEditCategory: editCategoryFromManager,
  onDeleteCategory: deleteCategoryFromManager,
  onSearch(query: string) {
    managerUi.search = query;
    managerUi.selectedChannelIds = [];
    if (currentState) {
      mountManager(currentState);
    }
  },
  onToggleChannel(channelId: string) {
    const selected = new Set(managerUi.selectedChannelIds);
    if (selected.has(channelId)) {
      selected.delete(channelId);
    } else {
      selected.add(channelId);
    }
    managerUi.selectedChannelIds = Array.from(selected);
    if (currentState) {
      mountManager(currentState);
    }
  },
  onSelectAll() {
    if (!currentState) {
      return;
    }
    managerUi.selectedChannelIds = getVisibleManagerChannels(currentState).map((channel) => channel.id);
    mountManager(currentState);
  },
  onClearSelected() {
    managerUi.selectedChannelIds = [];
    if (currentState) {
      mountManager(currentState);
    }
  },
  onMoveTargetChange(categoryId: string) {
    managerUi.moveTargetId = categoryId;
    if (currentState) {
      mountManager(currentState);
    }
  },
  onMoveSelected: moveSelectedFromManager,
  onExport() {
    if (!currentState) {
      return;
    }
    const csv = buildCategoriesCsv(currentState);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ytd-list-pro-categories-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    managerUi.status = "已导出 CSV 文件（可用 Excel 打开）";
    mountManager(currentState);
  },
  onImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      void safeAsync(async () => {
        const text = await file.text();
        const { items, errors } = parseCategoriesCsv(text);
        if (items.length === 0) {
          managerUi.status =
            errors[0] ?? "没有可导入的数据。CSV 需要三列：分类,频道名称,频道链接（频道名称可留空）";
          if (currentState) {
            mountManager(currentState);
          }
          return;
        }
        let importedCount = 0;
        let createdCount = 0;
        currentState = await updateState((state) => {
          const outcome = importChannelsToCategories(state, items, makeCategoryId);
          importedCount = outcome.importedCount;
          createdCount = outcome.createdCategories.length;
          return outcome.state;
        });
        const parts = [`已导入 ${importedCount} 个频道`];
        if (createdCount > 0) {
          parts.push(`新建 ${createdCount} 个分类`);
        }
        if (errors.length > 0) {
          parts.push(`跳过 ${errors.length} 行（${errors[0]}）`);
        }
        managerUi.status = parts.join("，");
        refreshViews(currentState);
      });
    });
    input.click();
  },
  onOpenChannel: openChannel,
  onSortChange(sortMode: ChannelSortMode) {
    managerUi.sortMode = sortMode;
    if (currentState) {
      mountManager(currentState);
    }
  },
  onDragCategoryStart(categoryId: string) {
    draggedCategoryId = categoryId;
  },
  onDropOnCategory: dropOnCategoryFromManager,
  onDragChannelStart(channelId: string, event: DragEvent) {
    event.dataTransfer?.setData("application/x-ytdlp-channel", channelId);
  },
  onDraftChange(patch: Partial<CategoryDraft>) {
    if (!managerUi.draft || !currentState) {
      return;
    }
    managerUi.draft = { ...managerUi.draft, ...patch };
    if (Object.keys(patch).length === 1 && Object.prototype.hasOwnProperty.call(patch, "name")) {
      return;
    }
    mountManager(currentState);
  },
  onDraftSave: saveCategoryDraftFromManager,
  onDraftCancel() {
    managerUi.draft = undefined;
    if (currentState) {
      mountManager(currentState);
    }
  }
};

const addMessageListener = () => {
  const listener = (message: { type?: string }, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
    if (message?.type === MESSAGE_TYPES.OPEN_MANAGER) {
      openManager();
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type !== MESSAGE_TYPES.COLLECT_SUBSCRIPTIONS) {
      return false;
    }

    void safeAsync(collectAndSaveSubscriptions, { ok: false, error: "Extension context invalidated" }).then(
      (response) => sendResponse(response)
    );
    return true;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
};

const addStorageListener = () => {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    const stateKey = activeStateStorageKey();
    if (areaName !== "local" || !changes[stateKey]?.newValue) {
      return;
    }
    currentState = changes[stateKey].newValue as ExtensionState;
    refreshViews(currentState);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
};

const addNavigationListeners = () => {
  const trigger = () => scheduleMount();
  window.addEventListener("popstate", trigger);
  window.addEventListener("yt-navigate-finish", trigger);

  const originalPushState = history.pushState;
  history.pushState = function pushState(...args) {
    const result = originalPushState.apply(this, args);
    trigger();
    return result;
  };

  return () => {
    window.removeEventListener("popstate", trigger);
    window.removeEventListener("yt-navigate-finish", trigger);
    history.pushState = originalPushState;
  };
};

const cleanupPrevious = () => {
  const targetWindow = window as CleanupWindow;
  targetWindow[CLEANUP_KEY]?.();
};

const start = () => {
  cleanupPrevious();
  const navigationCleanup = addNavigationListeners();
  const messageCleanup = addMessageListener();
  const storageCleanup = addStorageListener();
  const guideObserverCleanup = addGuideObserver();
  scheduleMount();

  (window as CleanupWindow)[CLEANUP_KEY] = () => {
    navigationCleanup();
    messageCleanup();
    storageCleanup();
    guideObserverCleanup();
    if (mountTimer !== undefined) {
      window.clearTimeout(mountTimer);
    }
    if (quickAddTimer !== undefined) {
      window.clearTimeout(quickAddTimer);
    }
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(MANAGER_ROOT_ID)?.remove();
    document.getElementById(QUICK_ADD_ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    if (originalSubscriptionsSection) {
      originalSubscriptionsSection.style.display = "";
    }
  };
};

start();
