import { UNCATEGORIZED_ID } from "../shared/constants";
import { channelHasNewVideo, getChannelsForCategory } from "../shared/state";
import type { CategoryIconId, Channel, ExtensionState, SidebarMode } from "../shared/types";

export interface SidebarSection {
  id: string;
  name: string;
  color: string;
  icon: CategoryIconId;
  count: number;
  expanded: boolean;
  channels: Channel[];
}

export interface SidebarHandlers {
  onModeChange(mode: SidebarMode): void;
  onToggleCategory(categoryId: string): void;
  onOpenChannel(channel: Channel): void;
  onOpenManager(): void;
}

type SvgNode = [keyof SVGElementTagNameMap, Record<string, string>];

const ICON_NODES: Record<CategoryIconId, SvgNode[]> = {
  default: [
    ["path", { d: "M4 9h16" }],
    ["path", { d: "M4 15h16" }],
    ["path", { d: "M10 3 8 21" }],
    ["path", { d: "m16 3-2 18" }]
  ],
  open: [
    ["path", { d: "M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v.5" }],
    ["path", { d: "M3.5 10h17l-1.7 7.5A2 2 0 0 1 16.8 19H6.2a2 2 0 0 1-2-1.5L3.5 10Z" }]
  ],
  video: [
    ["rect", { x: "3", y: "6", width: "13", height: "12", rx: "2" }],
    ["path", { d: "m16 10 5-3v10l-5-3Z" }]
  ],
  channel: [
    ["rect", { x: "4", y: "5", width: "16", height: "12", rx: "2" }],
    ["path", { d: "M9 21h6" }],
    ["path", { d: "M12 17v4" }]
  ],
  ai: [
    ["rect", { x: "4", y: "8", width: "16", height: "11", rx: "2" }],
    ["path", { d: "M12 8V4" }],
    ["path", { d: "M8 4h8" }],
    ["path", { d: "M8 13h.01" }],
    ["path", { d: "M16 13h.01" }],
    ["path", { d: "M9 16h6" }]
  ],
  code: [
    ["path", { d: "m8 16-4-4 4-4" }],
    ["path", { d: "m16 8 4 4-4 4" }],
    ["path", { d: "m14 4-4 16" }]
  ],
  learning: [
    ["path", { d: "M12 3a4 4 0 0 0-4 4v1a4 4 0 0 0-2 7.5" }],
    ["path", { d: "M12 3a4 4 0 0 1 4 4v1a4 4 0 0 1 2 7.5" }],
    ["path", { d: "M8 14h8" }],
    ["path", { d: "M12 11v8" }]
  ],
  music: [
    ["path", { d: "M9 18V5l12-2v13" }],
    ["circle", { cx: "6", cy: "18", r: "3" }],
    ["circle", { cx: "18", cy: "16", r: "3" }]
  ],
  idea: [
    ["path", { d: "M9 18h6" }],
    ["path", { d: "M10 22h4" }],
    ["path", { d: "M8.5 14.5A6 6 0 1 1 15.5 14.5c-.7.6-1.2 1.5-1.4 2.5H9.9c-.2-1-.7-1.9-1.4-2.5Z" }]
  ],
  interview: [
    ["path", { d: "M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" }],
    ["path", { d: "M8 9h8" }],
    ["path", { d: "M8 13h5" }]
  ]
};

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

const channelInitial = (name: string) => name.trim().slice(0, 1).toUpperCase() || "?";

export const createSvgIcon = (icon: CategoryIconId) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("data-icon", icon);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  for (const [tagName, attributes] of ICON_NODES[icon] ?? ICON_NODES.default) {
    const child = document.createElementNS("http://www.w3.org/2000/svg", tagName);
    for (const [name, value] of Object.entries(attributes)) {
      child.setAttribute(name, value);
    }
    svg.append(child);
  }

  return svg;
};

export function buildSidebarSections(state: ExtensionState): SidebarSection[] {
  const expanded = new Set(state.ui.expandedCategoryIds);
  const uncategorized = state.categories[UNCATEGORIZED_ID];
  const sections: SidebarSection[] = [
    {
      id: UNCATEGORIZED_ID,
      name: uncategorized.name,
      color: uncategorized.color,
      icon: uncategorized.icon,
      count: state.uncategorizedChannelIds.length,
      expanded: expanded.has(UNCATEGORIZED_ID),
      channels: getChannelsForCategory(state, UNCATEGORIZED_ID)
    }
  ];

  for (const categoryId of state.categoryOrder) {
    const category = state.categories[categoryId];
    if (!category) {
      continue;
    }
    const channels = getChannelsForCategory(state, categoryId);
    sections.push({
      id: category.id,
      name: category.name,
      color: category.color,
      icon: category.icon,
      count: channels.length,
      expanded: expanded.has(category.id),
      channels
    });
  }

  return sections;
}

const renderModeToggle = (state: ExtensionState, handlers: SidebarHandlers) => {
  const wrapper = createElement("div", "ytdlp-sidebar-controls");
  const toggle = createElement("div", "ytdlp-sidebar-toggle");
  const original = createElement("button", state.ui.sidebarMode === "original" ? "is-active" : "", "原始");
  const categorized = createElement("button", state.ui.sidebarMode === "categorized" ? "is-active" : "", "分类");
  const manage = createElement("button", "ytdlp-sidebar-manage", "管理");

  original.type = "button";
  categorized.type = "button";
  manage.type = "button";
  manage.title = "管理分类";
  original.addEventListener("click", () => handlers.onModeChange("original"));
  categorized.addEventListener("click", () => handlers.onModeChange("categorized"));
  manage.addEventListener("click", () => handlers.onOpenManager());

  toggle.append(original, categorized);
  wrapper.append(toggle, manage);
  return wrapper;
};

const renderChannel = (channel: Channel, handlers: SidebarHandlers) => {
  const hasNewVideo = channelHasNewVideo(channel);
  const item = createElement("button", "ytdlp-channel");
  item.type = "button";
  item.title = hasNewVideo ? `${channel.name}（有新视频）` : channel.name;
  item.addEventListener("click", () => handlers.onOpenChannel(channel));

  const avatar = createElement("span", "ytdlp-channel-avatar");
  if (channel.avatarUrl) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = channel.avatarUrl;
    image.loading = "lazy";
    image.addEventListener("error", () => {
      image.remove();
      avatar.textContent = channelInitial(channel.name);
    });
    avatar.append(image);
  } else {
    avatar.textContent = channelInitial(channel.name);
  }
  if (hasNewVideo) {
    const dot = createElement("span", "ytdlp-channel-dot");
    dot.setAttribute("aria-hidden", "true");
    avatar.append(dot);
  }

  const label = createElement("span", "ytdlp-channel-label", channel.name);
  item.append(avatar, label);
  return item;
};

const renderSection = (section: SidebarSection, handlers: SidebarHandlers) => {
  const wrapper = createElement("div", "ytdlp-section");
  const header = createElement("button", "ytdlp-section-header");
  header.type = "button";
  header.addEventListener("click", () => handlers.onToggleCategory(section.id));

  const icon = createElement("span", "ytdlp-section-icon");
  icon.style.backgroundColor = section.color;
  icon.append(createSvgIcon(section.icon));
  const name = createElement("span", "ytdlp-section-name", section.name);
  const count = createElement("span", "ytdlp-section-count", String(section.count));
  const chevron = createElement(
    "span",
    section.expanded ? "ytdlp-section-chevron is-expanded" : "ytdlp-section-chevron"
  );
  chevron.setAttribute("aria-hidden", "true");

  header.append(icon, name, count, chevron);
  wrapper.append(header);

  if (section.expanded) {
    const channels = createElement("div", "ytdlp-section-channels");
    for (const channel of section.channels) {
      channels.append(renderChannel(channel, handlers));
    }
    wrapper.append(channels);
  }

  return wrapper;
};

export function renderSidebar(root: HTMLElement, state: ExtensionState, handlers: SidebarHandlers): void {
  root.replaceChildren();
  root.className = "ytdlp-sidebar-root";
  root.append(renderModeToggle(state, handlers));

  if (state.ui.sidebarMode === "original") {
    return;
  }

  const sections = createElement("div", "ytdlp-sections");
  for (const section of buildSidebarSections(state)) {
    sections.append(renderSection(section, handlers));
  }
  root.append(sections);
}

export const SIDEBAR_STYLES = `
.ytdlp-sidebar-root {
  box-sizing: border-box;
  padding: 6px 12px 10px;
  color: var(--yt-spec-text-primary, #0f0f0f);
  font-family: Roboto, Arial, sans-serif;
}
.ytdlp-sidebar-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px;
  align-items: center;
  margin: 4px 0 8px;
}
.ytdlp-sidebar-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.ytdlp-sidebar-toggle button,
.ytdlp-sidebar-manage {
  border: 0;
  border-radius: 8px;
  min-height: 32px;
  background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.05));
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-weight: 500;
}
.ytdlp-sidebar-manage {
  padding: 0 9px;
  color: var(--yt-spec-text-primary, #0f0f0f);
}
.ytdlp-sidebar-toggle button.is-active {
  background: var(--yt-spec-text-primary, #0f0f0f);
  color: var(--yt-spec-text-primary-inverse, #fff);
}
.ytdlp-section {
  margin: 2px 0;
}
.ytdlp-section-header,
.ytdlp-channel {
  width: 100%;
  min-height: 34px;
  display: grid;
  align-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.ytdlp-section-header {
  grid-template-columns: 24px minmax(0, 1fr) auto 14px;
  gap: 8px;
  padding: 0 6px;
}
.ytdlp-section-header:hover,
.ytdlp-channel:hover {
  background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.05));
}
.ytdlp-section-icon {
  width: 22px;
  height: 22px;
  display: inline-grid;
  place-items: center;
  border-radius: 6px;
  color: #fff;
}
.ytdlp-section-icon svg {
  width: 15px;
  height: 15px;
}
.ytdlp-section-name,
.ytdlp-channel-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ytdlp-section-count {
  color: var(--yt-spec-text-secondary, #606060);
  font-size: 12px;
}
.ytdlp-section-chevron {
  color: var(--yt-spec-text-secondary, #606060);
  width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
}
.ytdlp-section-chevron::before {
  content: "";
  width: 6px;
  height: 6px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(-45deg);
}
.ytdlp-section-chevron.is-expanded::before {
  transform: rotate(45deg);
}
.ytdlp-section-channels {
  padding-left: 8px;
}
.ytdlp-channel {
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 8px;
  padding: 0 6px;
}
.ytdlp-channel-avatar {
  position: relative;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.05));
  color: var(--yt-spec-text-secondary, #606060);
  font-size: 11px;
}
.ytdlp-channel-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ytdlp-channel-dot {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  border: 2px solid var(--yt-spec-base-background, #fff);
}
`;
