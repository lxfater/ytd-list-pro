import { CATEGORY_ICONS, PRESET_COLORS, UNCATEGORIZED_ID } from "../shared/constants";
import { getChannelsForCategory, searchAllChannels } from "../shared/state";
import type { Category, CategoryIconId, Channel, ChannelSortMode, ExtensionState } from "../shared/types";
import { createSvgIcon } from "./sidebar";

export type CategoryDraft = {
  mode: "create" | "edit";
  id: string;
  name: string;
  color: string;
  icon: CategoryIconId;
};

export type ManagerUiState = {
  selectedCategoryId: string;
  selectedChannelIds: string[];
  search: string;
  moveTargetId: string;
  sortMode: ChannelSortMode;
  status: string;
  draft?: CategoryDraft;
};

export type ManagerHandlers = {
  onClose(): void;
  onRefresh(): void;
  onCreateCategory(): void;
  onSelectCategory(categoryId: string): void;
  onEditCategory(categoryId: string): void;
  onDeleteCategory(categoryId: string): void;
  onSearch(query: string): void;
  onToggleChannel(channelId: string): void;
  onSelectAll(): void;
  onClearSelected(): void;
  onMoveTargetChange(categoryId: string): void;
  onMoveSelected(): void;
  onOpenChannel(channel: Channel): void;
  onSortChange(sortMode: ChannelSortMode): void;
  onDragCategoryStart(categoryId: string): void;
  onDropOnCategory(categoryId: string, event: DragEvent): void;
  onDragChannelStart(channelId: string, event: DragEvent): void;
  onDraftChange(patch: Partial<CategoryDraft>): void;
  onDraftSave(): void;
  onDraftCancel(): void;
};

type CategoryRow = {
  category: Category;
  count: number;
};

type SvgPathNode = [keyof SVGElementTagNameMap, Record<string, string>];

const SORT_OPTIONS: Array<{ id: ChannelSortMode; label: string }> = [
  { id: "added-desc", label: "最近关注" },
  { id: "added-asc", label: "最早关注" },
  { id: "name-asc", label: "名称 A-Z" },
  { id: "name-desc", label: "名称 Z-A" },
  { id: "manual", label: "当前顺序" }
];

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
};

const categoryRows = (state: ExtensionState): CategoryRow[] => [
  {
    category: state.categories[UNCATEGORIZED_ID],
    count: state.uncategorizedChannelIds.length
  },
  ...state.categoryOrder
    .map((id) => state.categories[id])
    .filter(Boolean)
    .map((category) => ({ category, count: category.channelIds.length }))
];

const channelInitial = (name: string) => name.trim().slice(0, 1).toUpperCase() || "?";

const channelSortTime = (channel: Channel): number => channel.subscribedAt ?? channel.discoveredAt ?? 0;

const sortChannels = (channels: Channel[], sortMode: ChannelSortMode): Channel[] =>
  channels
    .map((channel, index) => ({ channel, index }))
    .sort((left, right) => {
      if (sortMode === "manual") {
        return left.index - right.index;
      }
      if (sortMode === "name-asc" || sortMode === "name-desc") {
        const comparison = left.channel.name.localeCompare(right.channel.name, undefined, { sensitivity: "base" });
        return sortMode === "name-asc" ? comparison : -comparison;
      }

      const comparison = channelSortTime(left.channel) - channelSortTime(right.channel);
      if (comparison !== 0) {
        return sortMode === "added-asc" ? comparison : -comparison;
      }
      return left.index - right.index;
    })
    .map((item) => item.channel);

const renderCategoryIcon = (category: Pick<Category, "color" | "icon">, sizeClass = "ytdlp-manager-category-icon") => {
  const icon = createElement("span", sizeClass);
  icon.style.backgroundColor = category.color;
  icon.append(createSvgIcon(category.icon));
  return icon;
};

const createActionIcon = (name: "edit" | "trash" | "external") => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("data-icon", name);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  let paths: SvgPathNode[];
  if (name === "external") {
    paths = [
      ["path", { d: "M15 3h6v6" }],
      ["path", { d: "M10 14 21 3" }],
      ["path", { d: "M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" }]
    ];
  } else if (name === "edit") {
    paths = [
      ["path", { d: "M12 20h9" }],
      ["path", { d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" }]
    ];
  } else {
    paths = [
      ["path", { d: "M3 6h18" }],
      ["path", { d: "M8 6V4h8v2" }],
      ["path", { d: "M19 6l-1 14H6L5 6" }],
      ["path", { d: "M10 11v6" }],
      ["path", { d: "M14 11v6" }]
    ];
  }

  for (const [tagName, attributes] of paths) {
    const child = document.createElementNS("http://www.w3.org/2000/svg", tagName);
    for (const [attribute, value] of Object.entries(attributes)) {
      child.setAttribute(attribute, value);
    }
    svg.append(child);
  }

  return svg;
};

const renderCategoryList = (
  rows: CategoryRow[],
  selectedCategoryId: string,
  handlers: ManagerHandlers
): HTMLElement => {
  const list = createElement("div", "ytdlp-manager-categories");
  for (const { category, count } of rows) {
    const row = createElement(
      "button",
      category.id === selectedCategoryId ? "ytdlp-manager-category is-active" : "ytdlp-manager-category"
    );
    row.type = "button";
    row.draggable = !category.isSystem;
    row.addEventListener("click", () => handlers.onSelectCategory(category.id));
    row.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("application/x-ytdlp-category", category.id);
      handlers.onDragCategoryStart(category.id);
    });
    row.addEventListener("dragover", (event) => event.preventDefault());
    row.addEventListener("drop", (event) => handlers.onDropOnCategory(category.id, event));

    const name = createElement("span", "ytdlp-manager-category-name", category.name);
    const badge = createElement("span", "ytdlp-manager-category-count", String(count));
    const actions = createElement("span", "ytdlp-manager-category-actions");

    if (!category.isSystem) {
      const edit = createElement("button", "ytdlp-manager-icon-button", "");
      edit.type = "button";
      edit.title = "编辑分类";
      edit.append(createActionIcon("edit"));
      edit.addEventListener("click", (event) => {
        event.stopPropagation();
        handlers.onEditCategory(category.id);
      });

      const remove = createElement("button", "ytdlp-manager-icon-button is-danger", "");
      remove.type = "button";
      remove.title = "删除分类";
      remove.append(createActionIcon("trash"));
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        handlers.onDeleteCategory(category.id);
      });
      actions.append(edit, remove);
    }

    row.append(renderCategoryIcon(category), name, badge, actions);
    list.append(row);
  }
  return list;
};

const renderChannelAvatar = (channel: Channel): HTMLElement => {
  const avatar = createElement("span", "ytdlp-manager-avatar");
  if (channel.avatarUrl) {
    const image = document.createElement("img");
    image.alt = "";
    image.loading = "lazy";
    image.src = channel.avatarUrl;
    image.addEventListener("error", () => {
      image.remove();
      avatar.textContent = channelInitial(channel.name);
    });
    avatar.append(image);
  } else {
    avatar.textContent = channelInitial(channel.name);
  }
  return avatar;
};

const renderChannels = (
  channels: Channel[],
  selectedChannelIds: Set<string>,
  handlers: ManagerHandlers,
  categoryLabels?: Map<string, string>
): HTMLElement => {
  const list = createElement("div", "ytdlp-manager-channels");
  for (const channel of channels) {
    const selected = selectedChannelIds.has(channel.id);
    const row = createElement("div", selected ? "ytdlp-manager-channel is-selected" : "ytdlp-manager-channel");
    row.draggable = true;
    row.addEventListener("dblclick", () => handlers.onOpenChannel(channel));
    row.addEventListener("dragstart", (event) => handlers.onDragChannelStart(channel.id, event));

    const checkbox = createElement("button", "ytdlp-manager-check", selected ? "✓" : "");
    checkbox.type = "button";
    checkbox.title = selected ? "取消选择" : "选择频道";
    checkbox.addEventListener("click", () => handlers.onToggleChannel(channel.id));

    const text = createElement("span", "ytdlp-manager-channel-text");
    const title = createElement("strong", undefined, channel.name);
    const categoryLabel = categoryLabels?.get(channel.id);
    if (categoryLabel) {
      title.append(createElement("span", "ytdlp-manager-channel-category", categoryLabel));
    }
    text.append(title);
    text.append(createElement("small", undefined, channel.handle ?? channel.id));

    const open = createElement("button", "ytdlp-manager-icon-button", "");
    open.type = "button";
    open.title = "打开频道";
    open.append(createActionIcon("external"));
    open.addEventListener("click", () => handlers.onOpenChannel(channel));

    row.append(checkbox, renderChannelAvatar(channel), text, open);
    list.append(row);
  }
  return list;
};

const renderDraftEditor = (draft: CategoryDraft, handlers: ManagerHandlers): HTMLElement => {
  const backdrop = createElement("div", "ytdlp-manager-editor-backdrop");
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      handlers.onDraftCancel();
    }
  });

  const editor = createElement("section", "ytdlp-manager-editor");
  editor.setAttribute("role", "dialog");
  editor.setAttribute("aria-modal", "true");

  const header = createElement("div", "ytdlp-manager-editor-header");
  header.append(createElement("h3", undefined, draft.mode === "create" ? "新建分类" : "编辑分类"));
  const close = createElement("button", "ytdlp-manager-icon-button", "×");
  close.type = "button";
  close.title = "关闭";
  close.addEventListener("click", handlers.onDraftCancel);
  header.append(close);

  const nameLabel = createElement("label", "ytdlp-manager-field");
  nameLabel.append(createElement("span", undefined, "名称"));
  const name = document.createElement("input");
  name.name = "category-name";
  name.value = draft.name;
  const preview = createElement("div", "ytdlp-manager-preview");
  const previewName = createElement("strong", undefined, draft.name.trim() || "新分类");
  preview.append(renderCategoryIcon(draft), previewName);

  name.addEventListener("input", () => {
    previewName.textContent = name.value.trim() || "新分类";
    handlers.onDraftChange({ name: name.value });
  });
  name.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handlers.onDraftSave();
    }
  });
  nameLabel.append(name);

  const colorSection = createElement("div", "ytdlp-manager-editor-section");
  colorSection.append(createElement("span", "ytdlp-manager-label", "颜色"));
  const colors = createElement("div", "ytdlp-manager-color-grid");
  for (const color of PRESET_COLORS) {
    const swatch = createElement("button", color === draft.color ? "ytdlp-manager-swatch is-active" : "ytdlp-manager-swatch");
    swatch.type = "button";
    swatch.title = color;
    swatch.style.backgroundColor = color;
    swatch.addEventListener("click", () => handlers.onDraftChange({ color }));
    colors.append(swatch);
  }
  const custom = createElement("label", "ytdlp-manager-custom-color");
  custom.append(createElement("span", undefined, "自定义"));
  const customInput = document.createElement("input");
  customInput.type = "color";
  customInput.value = draft.color;
  customInput.addEventListener("input", () => handlers.onDraftChange({ color: customInput.value }));
  custom.append(customInput, createElement("code", undefined, draft.color));
  colorSection.append(colors, custom);

  const iconSection = createElement("div", "ytdlp-manager-editor-section");
  iconSection.append(createElement("span", "ytdlp-manager-label", "图标"));
  const icons = createElement("div", "ytdlp-manager-icon-grid");
  for (const item of CATEGORY_ICONS) {
    const option = createElement(
      "button",
      item.id === draft.icon ? "ytdlp-manager-icon-choice is-active" : "ytdlp-manager-icon-choice"
    );
    option.type = "button";
    option.title = item.label;
    option.dataset.iconChoice = item.id;
    option.append(createSvgIcon(item.id), createElement("span", undefined, item.label));
    option.addEventListener("click", () => handlers.onDraftChange({ icon: item.id }));
    icons.append(option);
  }
  iconSection.append(icons);

  const actions = createElement("div", "ytdlp-manager-editor-actions");
  const cancel = createElement("button", "ytdlp-manager-secondary", "取消");
  cancel.type = "button";
  cancel.addEventListener("click", handlers.onDraftCancel);
  const save = createElement("button", "ytdlp-manager-primary", "保存");
  save.type = "button";
  save.addEventListener("click", handlers.onDraftSave);
  actions.append(cancel, save);

  editor.append(header, nameLabel, preview, colorSection, iconSection, actions);
  backdrop.append(editor);

  window.setTimeout(() => {
    name.focus();
    name.select();
  }, 0);

  return backdrop;
};

export function renderManager(
  root: HTMLElement,
  state: ExtensionState,
  ui: ManagerUiState,
  handlers: ManagerHandlers
): void {
  const previousSearch = root.querySelector<HTMLInputElement>(".ytdlp-manager-search");
  const searchWasFocused = previousSearch !== null && document.activeElement === previousSearch;
  root.replaceChildren();
  root.className = "ytdlp-manager-root";

  const rows = categoryRows(state);
  const currentCategory = state.categories[ui.selectedCategoryId] ?? state.categories[UNCATEGORIZED_ID];
  const searchHits = ui.search.trim() ? searchAllChannels(state, ui.search) : undefined;
  const visibleChannels = sortChannels(
    searchHits ? searchHits.map((hit) => hit.channel) : getChannelsForCategory(state, currentCategory.id),
    ui.sortMode
  );
  const categoryLabels = searchHits
    ? new Map(searchHits.map((hit) => [hit.channel.id, hit.categoryName]))
    : undefined;
  const selectedChannelIds = new Set(ui.selectedChannelIds);

  const shell = createElement("div", "ytdlp-manager-shell");
  shell.addEventListener("click", (event) => {
    if (event.target === shell) {
      handlers.onClose();
    }
  });
  const drawer = createElement("aside", "ytdlp-manager-drawer");
  drawer.addEventListener("click", (event) => event.stopPropagation());

  const layout = createElement("div", "ytdlp-manager-layout");
  const left = createElement("section", "ytdlp-manager-left");
  const leftHeader = createElement("div", "ytdlp-manager-pane-header");
  leftHeader.append(createElement("strong", undefined, "分类"));
  const add = createElement("button", "ytdlp-manager-primary", "新建");
  add.type = "button";
  add.addEventListener("click", handlers.onCreateCategory);
  leftHeader.append(add);
  left.append(leftHeader, renderCategoryList(rows, currentCategory.id, handlers));

  const right = createElement("section", "ytdlp-manager-right");
  const toolbar = createElement("div", "ytdlp-manager-toolbar");
  const refresh = createElement("button", "ytdlp-manager-primary ytdlp-manager-refresh", "刷新频道");
  refresh.type = "button";
  refresh.addEventListener("click", handlers.onRefresh);
  const search = createElement("input", "ytdlp-manager-search");
  search.placeholder = "搜索全部分类";
  search.value = ui.search;
  let composing = false;
  search.addEventListener("compositionstart", () => {
    composing = true;
  });
  search.addEventListener("compositionend", () => {
    composing = false;
    handlers.onSearch(search.value);
  });
  search.addEventListener("input", () => {
    if (!composing) {
      handlers.onSearch(search.value);
    }
  });
  const sort = document.createElement("select");
  sort.className = "ytdlp-manager-sort";
  sort.title = "排序";
  sort.addEventListener("change", () => handlers.onSortChange(sort.value as ChannelSortMode));
  for (const item of SORT_OPTIONS) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.label;
    sort.append(option);
  }
  sort.value = ui.sortMode;
  const selectAll = createElement("button", "ytdlp-manager-secondary", "全选");
  selectAll.type = "button";
  selectAll.addEventListener("click", handlers.onSelectAll);
  const clear = createElement("button", "ytdlp-manager-secondary", "取消");
  clear.type = "button";
  clear.addEventListener("click", handlers.onClearSelected);
  toolbar.append(refresh, search, sort, selectAll, clear);

  const summary = createElement("div", "ytdlp-manager-summary");
  const summaryText = createElement("div");
  summaryText.append(
    createElement("h3", undefined, searchHits ? "搜索结果" : currentCategory.name),
    createElement(
      "p",
      undefined,
      searchHits
        ? `全部分类中找到 ${visibleChannels.length} 个频道，已选 ${selectedChannelIds.size} 个`
        : `${visibleChannels.length} 个频道，已选 ${selectedChannelIds.size} 个`
    )
  );
  const moveTools = createElement("div", "ytdlp-manager-move-tools");
  const select = document.createElement("select");
  select.value = ui.moveTargetId;
  select.addEventListener("change", () => handlers.onMoveTargetChange(select.value));
  for (const row of rows) {
    const option = document.createElement("option");
    option.value = row.category.id;
    option.textContent = `${row.category.name} (${row.count})`;
    select.append(option);
  }
  const move = createElement("button", "ytdlp-manager-secondary", "移动");
  move.type = "button";
  move.disabled = selectedChannelIds.size === 0;
  move.addEventListener("click", handlers.onMoveSelected);
  moveTools.append(select, move);
  summary.append(summaryText, moveTools);

  right.append(toolbar, summary, renderChannels(visibleChannels, selectedChannelIds, handlers, categoryLabels), createElement("div", "ytdlp-manager-status", ui.status));
  layout.append(left, right);
  drawer.append(layout);
  shell.append(drawer);
  root.append(shell);

  if (ui.draft) {
    root.append(renderDraftEditor(ui.draft, handlers));
  }

  if (searchWasFocused) {
    const caret = search.value.length;
    search.focus();
    search.setSelectionRange(caret, caret);
  }
}

export const MANAGER_STYLES = `
.ytdlp-manager-root {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
  color: var(--yt-spec-text-primary, #0f0f0f);
  font-family: Roboto, Arial, sans-serif;
}
.ytdlp-manager-shell {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.18);
  pointer-events: auto;
}
.ytdlp-manager-drawer {
  width: min(960px, calc(100vw - 48px));
  height: calc(100% - 32px);
  margin: 16px 16px 16px 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  background: var(--yt-spec-base-background, #fff);
  border: 1px solid var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.12));
  border-radius: 12px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}
.ytdlp-manager-pane-header,
.ytdlp-manager-toolbar,
.ytdlp-manager-summary,
.ytdlp-manager-editor-header,
.ytdlp-manager-editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.ytdlp-manager-summary h3,
.ytdlp-manager-editor h3 {
  font-size: 18px;
  line-height: 24px;
  font-weight: 700;
}
.ytdlp-manager-summary h3,
.ytdlp-manager-editor h3,
.ytdlp-manager-summary p {
  margin: 0;
}
.ytdlp-manager-summary p,
.ytdlp-manager-status,
.ytdlp-manager-channel small {
  color: var(--yt-spec-text-secondary, #606060);
  font-size: 12px;
}
.ytdlp-manager-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: 268px minmax(0, 1fr);
}
.ytdlp-manager-left,
.ytdlp-manager-right {
  min-width: 0;
  min-height: 0;
  display: grid;
  gap: 10px;
  padding: 12px;
}
.ytdlp-manager-left {
  grid-template-rows: auto minmax(0, 1fr);
  border-right: 1px solid var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.12));
}
.ytdlp-manager-right {
  grid-template-rows: auto auto minmax(0, 1fr) auto;
}
.ytdlp-manager-categories,
.ytdlp-manager-channels {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ytdlp-manager-channels {
  gap: 0;
}
.ytdlp-manager-category,
.ytdlp-manager-channel {
  display: grid;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
}
.ytdlp-manager-category {
  grid-template-columns: 30px minmax(0, 1fr) auto 76px;
  padding: 5px 7px;
  border-radius: 8px;
  text-align: left;
}
.ytdlp-manager-category.is-active,
.ytdlp-manager-channel.is-selected {
  border-color: transparent;
  background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.08));
}
.ytdlp-manager-category:hover,
.ytdlp-manager-channel:hover {
  background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.05));
}
.ytdlp-manager-category-icon {
  width: 30px;
  height: 30px;
  display: inline-grid;
  place-items: center;
  border-radius: 8px;
  color: #fff;
}
.ytdlp-manager-category-icon svg,
.ytdlp-manager-icon-choice svg,
.ytdlp-manager-icon-button svg {
  width: 16px;
  height: 16px;
}
.ytdlp-manager-category-name,
.ytdlp-manager-channel-text strong,
.ytdlp-manager-channel-text small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ytdlp-manager-category-count {
  color: var(--yt-spec-text-secondary, #606060);
  font-size: 12px;
}
.ytdlp-manager-channel-category {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.05));
  color: var(--yt-spec-text-secondary, #606060);
  font-size: 11px;
  font-weight: 400;
  vertical-align: middle;
}
.ytdlp-manager-category-actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
}
.ytdlp-manager-primary,
.ytdlp-manager-secondary,
.ytdlp-manager-icon-button,
.ytdlp-manager-check,
.ytdlp-manager-search,
.ytdlp-manager-sort,
.ytdlp-manager-move-tools select {
  min-height: 36px;
  border: 1px solid transparent;
  border-radius: 18px;
  background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.05));
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.ytdlp-manager-primary,
.ytdlp-manager-secondary {
  padding: 0 14px;
  font-weight: 500;
}
.ytdlp-manager-primary {
  background: var(--yt-spec-text-primary, #0f0f0f);
  color: var(--yt-spec-text-primary-inverse, #fff);
}
.ytdlp-manager-secondary:hover,
.ytdlp-manager-icon-button:hover,
.ytdlp-manager-check:hover {
  background: var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.1));
}
.ytdlp-manager-icon-button {
  width: 36px;
  display: inline-grid;
  place-items: center;
  padding: 0;
}
.ytdlp-manager-icon-button.is-danger:hover {
  color: #dc2626;
  background: #fee2e2;
}
.ytdlp-manager-search {
  min-width: 160px;
  flex: 1;
  padding: 0 14px;
  cursor: text;
  background: var(--yt-spec-base-background, #fff);
  border-color: var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.12));
}
.ytdlp-manager-sort {
  min-width: 118px;
  padding: 0 12px;
}
.ytdlp-manager-move-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ytdlp-manager-move-tools select {
  max-width: 170px;
}
.ytdlp-manager-channel {
  grid-template-columns: 28px 38px minmax(0, 1fr) 36px;
  min-height: 58px;
  padding: 7px 8px;
  border-radius: 0;
  border-bottom-color: var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.1));
  background: transparent;
}
.ytdlp-manager-check {
  width: 24px;
  height: 24px;
  min-height: 24px;
  border: 2px solid var(--yt-spec-call-to-action, #065fd4);
  border-radius: 4px;
  background: transparent;
  color: var(--yt-spec-call-to-action, #065fd4);
  font-weight: 800;
}
.ytdlp-manager-avatar {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.08));
  color: var(--yt-spec-text-secondary, #606060);
  font-weight: 800;
}
.ytdlp-manager-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ytdlp-manager-channel-text {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.ytdlp-manager-editor-backdrop {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.24);
  pointer-events: auto;
}
.ytdlp-manager-editor {
  width: min(380px, 100%);
  max-height: 100%;
  display: grid;
  gap: 13px;
  overflow: auto;
  border: 1px solid var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.12));
  border-radius: 12px;
  padding: 16px;
  background: var(--yt-spec-base-background, #fff);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
}
.ytdlp-manager-field,
.ytdlp-manager-editor-section {
  display: grid;
  gap: 7px;
}
.ytdlp-manager-field input {
  height: 36px;
  border: 1px solid var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
  padding: 0 10px;
  color: inherit;
  background: var(--yt-spec-base-background, #fff);
}
.ytdlp-manager-label,
.ytdlp-manager-field span,
.ytdlp-manager-custom-color span {
  color: var(--yt-spec-text-secondary, #606060);
  font-size: 12px;
  font-weight: 700;
}
.ytdlp-manager-preview {
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.12));
  border-radius: 8px;
  padding: 8px;
}
.ytdlp-manager-color-grid,
.ytdlp-manager-icon-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 7px;
}
.ytdlp-manager-swatch {
  width: 30px;
  height: 30px;
  border: 2px solid transparent;
  border-radius: 8px;
}
.ytdlp-manager-swatch.is-active,
.ytdlp-manager-icon-choice.is-active {
  border-color: currentColor;
}
.ytdlp-manager-custom-color {
  display: grid;
  grid-template-columns: auto 34px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.ytdlp-manager-custom-color input {
  width: 34px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.12));
  border-radius: 8px;
  background: transparent;
}
.ytdlp-manager-custom-color code {
  color: var(--yt-spec-text-secondary, #606060);
}
.ytdlp-manager-icon-choice {
  min-width: 0;
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.12));
  border-radius: 8px;
  background: transparent;
  color: inherit;
}
.ytdlp-manager-icon-choice span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ytdlp-manager-editor-actions {
  justify-content: flex-end;
}
`;
