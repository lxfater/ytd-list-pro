import {
  PRESET_COLORS,
  RECOVERED_CATEGORY_APPEARANCE,
  STATE_SCHEMA_VERSION,
  UNCATEGORIZED_CATEGORY,
  UNCATEGORIZED_ID
} from "./constants";
import { normalizeAvatarUrl } from "./avatar";
import type { Category, CategoryInput, Channel, ExtensionState, LegacyImportData } from "./types";

const unique = (items: string[]): string[] => Array.from(new Set(items));

const cloneCategory = (category: Category): Category => ({
  ...category,
  channelIds: [...category.channelIds]
});

const cloneState = (state: ExtensionState): ExtensionState => ({
  ...state,
  channels: { ...state.channels },
  categories: Object.fromEntries(
    Object.entries(state.categories).map(([id, category]) => [id, cloneCategory(category)])
  ),
  categoryOrder: [...state.categoryOrder],
  uncategorizedChannelIds: [...state.uncategorizedChannelIds],
  ui: {
    sidebarMode: state.ui.sidebarMode,
    expandedCategoryIds: [...state.ui.expandedCategoryIds]
  }
});

const normalizeName = (name: string) => name.trim() || "未命名频道";

const normalizeTimestamp = (value: number | undefined): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

const normalizeChannel = (channel: Channel): Channel => {
  const subscribedAt = normalizeTimestamp(channel.subscribedAt);
  const discoveredAt = normalizeTimestamp(channel.discoveredAt);
  return {
    id: channel.id.trim(),
    name: normalizeName(channel.name),
    handle: channel.handle?.trim() || undefined,
    avatarUrl: normalizeAvatarUrl(channel.avatarUrl),
    url: channel.url.trim(),
    ...(subscribedAt === undefined ? {} : { subscribedAt }),
    ...(discoveredAt === undefined ? {} : { discoveredAt })
  };
};

const isPlaceholderRecoveryChannel = (channel: Channel): boolean =>
  channel.id.startsWith("UClegacy") ||
  channel.name.startsWith("Recovered Channel") ||
  channel.handle?.startsWith("@recovered") === true;

const hasPlaceholderRecoveryData = (state: ExtensionState): boolean =>
  Object.values(state.channels).some(isPlaceholderRecoveryChannel);

const upgradeRecoveredCategoryAppearance = (currentState: ExtensionState): ExtensionState => {
  let changed = false;
  const state = cloneState(currentState);

  for (const category of Object.values(state.categories)) {
    const appearance = RECOVERED_CATEGORY_APPEARANCE[category.name.trim().toLocaleLowerCase()];
    if (!appearance) {
      continue;
    }
    if (category.icon === "open") {
      category.icon = appearance.icon;
      changed = true;
    }
    if (category.color === "" || category.color === "#8b5cf6" || category.color === "#22c55e") {
      category.color = appearance.color;
      changed = true;
    }
  }

  return changed ? state : currentState;
};

const removeChannelsFromAllBuckets = (state: ExtensionState, channelIds: string[]): void => {
  const moving = new Set(channelIds);
  for (const category of Object.values(state.categories)) {
    category.channelIds = category.channelIds.filter((id) => !moving.has(id));
  }
  state.uncategorizedChannelIds = state.uncategorizedChannelIds.filter((id) => !moving.has(id));
};

const pruneMissingChannels = (state: ExtensionState, existingIds: Set<string>): void => {
  for (const category of Object.values(state.categories)) {
    category.channelIds = category.channelIds.filter((id) => existingIds.has(id));
  }
  state.uncategorizedChannelIds = state.uncategorizedChannelIds.filter((id) => existingIds.has(id));
};

export function createEmptyState(): ExtensionState {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    channels: {},
    categories: {
      [UNCATEGORIZED_ID]: cloneCategory(UNCATEGORIZED_CATEGORY)
    },
    categoryOrder: [],
    uncategorizedChannelIds: [],
    ui: {
      sidebarMode: "categorized",
      expandedCategoryIds: [UNCATEGORIZED_ID]
    },
    importedLegacyData: false
  };
}

export function mergeSubscriptions(
  currentState: ExtensionState,
  incomingChannels: Channel[],
  syncedAt = Date.now()
): ExtensionState {
  const state = cloneState(currentState);
  const normalizedChannels = incomingChannels
    .map(normalizeChannel)
    .filter((channel) => channel.id.length > 0);
  const channelsWithDiscoveryTimes = normalizedChannels.map((channel) => {
    const existing = findChannelByIdOrHandle(currentState, channel.id, channel.handle);
    const subscribedAt = channel.subscribedAt ?? existing?.subscribedAt;
    return {
      ...channel,
      ...(subscribedAt === undefined ? {} : { subscribedAt }),
      discoveredAt: channel.discoveredAt ?? existing?.discoveredAt ?? (existing ? 0 : syncedAt),
      // A subscription refresh rebuilds `state.channels` from scratch, so feed
      // tracking (new-upload dot) has to be carried over explicitly or it
      // would silently reset every time the user clicks "刷新频道".
      ...(existing?.latestVideoAt === undefined ? {} : { latestVideoAt: existing.latestVideoAt }),
      ...(existing?.seenVideoAt === undefined ? {} : { seenVideoAt: existing.seenVideoAt }),
      ...(existing?.feedCheckedAt === undefined ? {} : { feedCheckedAt: existing.feedCheckedAt })
    };
  });
  const incomingById = new Map(channelsWithDiscoveryTimes.map((channel) => [channel.id, channel]));
  const incomingIds = new Set(incomingById.keys());

  // Channels assigned from a page context may be stored under a fallback
  // `handle:xxx` id; once a full sync provides the canonical channel id,
  // migrate bucket assignments so the categorization survives.
  const incomingIdByHandle = new Map(
    channelsWithDiscoveryTimes
      .filter((channel) => channel.handle)
      .map((channel) => [channel.handle!.toLocaleLowerCase(), channel.id])
  );
  const remappedIds = new Map<string, string>();
  for (const [oldId, oldChannel] of Object.entries(currentState.channels)) {
    if (incomingIds.has(oldId)) {
      continue;
    }
    const handleKey = oldChannel.handle?.toLocaleLowerCase();
    const newId = handleKey ? incomingIdByHandle.get(handleKey) : undefined;
    if (newId && newId !== oldId) {
      remappedIds.set(oldId, newId);
    }
  }
  if (remappedIds.size > 0) {
    for (const category of Object.values(state.categories)) {
      category.channelIds = unique(category.channelIds.map((id) => remappedIds.get(id) ?? id));
    }
    state.uncategorizedChannelIds = unique(state.uncategorizedChannelIds.map((id) => remappedIds.get(id) ?? id));
  }

  state.channels = Object.fromEntries(incomingById);
  pruneMissingChannels(state, incomingIds);

  const assignedIds = new Set<string>();
  for (const categoryId of state.categoryOrder) {
    for (const channelId of state.categories[categoryId]?.channelIds ?? []) {
      assignedIds.add(channelId);
    }
  }
  for (const channelId of state.uncategorizedChannelIds) {
    assignedIds.add(channelId);
  }

  for (const channel of normalizedChannels) {
    if (!assignedIds.has(channel.id)) {
      state.uncategorizedChannelIds.push(channel.id);
      assignedIds.add(channel.id);
    }
  }

  state.uncategorizedChannelIds = unique(state.uncategorizedChannelIds).filter((id) => incomingIds.has(id));
  state.lastSyncedAt = syncedAt;
  return state;
}

export function addCategory(currentState: ExtensionState, input: CategoryInput): ExtensionState {
  if (input.id === UNCATEGORIZED_ID) {
    throw new Error("Cannot replace system category");
  }
  const state = cloneState(currentState);
  const category: Category = {
    ...input,
    name: input.name.trim() || "新分类",
    channelIds: []
  };
  state.categories[category.id] = category;
  state.categoryOrder = unique([...state.categoryOrder.filter((id) => id !== category.id), category.id]);
  return state;
}

export function renameCategory(currentState: ExtensionState, categoryId: string, name: string): ExtensionState {
  if (categoryId === UNCATEGORIZED_ID) {
    throw new Error("Cannot rename system category");
  }
  const state = cloneState(currentState);
  const category = state.categories[categoryId];
  if (!category) {
    throw new Error(`Category not found: ${categoryId}`);
  }
  category.name = name;
  return state;
}

export function deleteCategory(currentState: ExtensionState, categoryId: string): ExtensionState {
  if (categoryId === UNCATEGORIZED_ID) {
    throw new Error("Cannot delete system category");
  }
  const state = cloneState(currentState);
  const category = state.categories[categoryId];
  if (!category) {
    return state;
  }
  state.uncategorizedChannelIds = unique([...state.uncategorizedChannelIds, ...category.channelIds]);
  delete state.categories[categoryId];
  state.categoryOrder = state.categoryOrder.filter((id) => id !== categoryId);
  state.ui.expandedCategoryIds = state.ui.expandedCategoryIds.filter((id) => id !== categoryId);
  return state;
}

export function reorderCategories(currentState: ExtensionState, orderedCategoryIds: string[]): ExtensionState {
  const state = cloneState(currentState);
  const userCategoryIds = new Set(state.categoryOrder);
  const requested = orderedCategoryIds.filter((id) => userCategoryIds.has(id));
  const missing = state.categoryOrder.filter((id) => !requested.includes(id));
  state.categoryOrder = [...requested, ...missing];
  return state;
}

export function moveChannels(
  currentState: ExtensionState,
  channelIds: string[],
  targetCategoryId: string
): ExtensionState {
  const state = cloneState(currentState);
  const knownChannelIds = unique(channelIds).filter((id) => state.channels[id]);
  if (knownChannelIds.length === 0) {
    return state;
  }
  if (targetCategoryId !== UNCATEGORIZED_ID && !state.categories[targetCategoryId]) {
    throw new Error(`Category not found: ${targetCategoryId}`);
  }

  removeChannelsFromAllBuckets(state, knownChannelIds);

  if (targetCategoryId === UNCATEGORIZED_ID) {
    state.uncategorizedChannelIds = unique([...state.uncategorizedChannelIds, ...knownChannelIds]);
  } else {
    state.categories[targetCategoryId].channelIds = unique([
      ...state.categories[targetCategoryId].channelIds,
      ...knownChannelIds
    ]);
  }
  return state;
}

export function findChannelByIdOrHandle(state: ExtensionState, id: string, handle?: string): Channel | undefined {
  if (state.channels[id]) {
    return state.channels[id];
  }
  const handleKey = handle?.trim().toLocaleLowerCase();
  if (!handleKey) {
    return undefined;
  }
  return Object.values(state.channels).find((channel) => channel.handle?.toLocaleLowerCase() === handleKey);
}

export function getChannelCategoryId(state: ExtensionState, channelId: string): string | undefined {
  if (state.uncategorizedChannelIds.includes(channelId)) {
    return UNCATEGORIZED_ID;
  }
  for (const categoryId of state.categoryOrder) {
    if (state.categories[categoryId]?.channelIds.includes(channelId)) {
      return categoryId;
    }
  }
  return undefined;
}

export function upsertChannelToCategory(
  currentState: ExtensionState,
  incoming: Channel,
  categoryId: string,
  now = Date.now()
): ExtensionState {
  const normalized = normalizeChannel(incoming);
  if (!normalized.id) {
    return currentState;
  }
  const existing = findChannelByIdOrHandle(currentState, normalized.id, normalized.handle);
  const state = cloneState(currentState);
  const channelId = existing?.id ?? normalized.id;
  if (existing) {
    state.channels[channelId] = {
      ...existing,
      name: normalized.name === "未命名频道" ? existing.name : normalized.name,
      handle: existing.handle ?? normalized.handle,
      avatarUrl: existing.avatarUrl ?? normalized.avatarUrl
    };
  } else {
    state.channels[channelId] = {
      ...normalized,
      subscribedAt: normalized.subscribedAt ?? now,
      discoveredAt: normalized.discoveredAt ?? now
    };
  }
  return moveChannels(state, [channelId], categoryId);
}

export interface CategorizedChannelImport {
  channel: Channel;
  categoryName: string;
}

export interface ImportOutcome {
  state: ExtensionState;
  importedCount: number;
  createdCategories: string[];
}

export function importChannelsToCategories(
  currentState: ExtensionState,
  items: CategorizedChannelImport[],
  makeCategoryId: () => string,
  now = Date.now()
): ImportOutcome {
  let state = cloneState(currentState);
  const createdCategories: string[] = [];
  let importedCount = 0;

  const findCategoryIdByName = (name: string): string | undefined => {
    const key = name.trim().toLocaleLowerCase();
    if (!key || key === UNCATEGORIZED_CATEGORY.name || key === "uncategorized") {
      return UNCATEGORIZED_ID;
    }
    for (const category of Object.values(state.categories)) {
      if (category.name.trim().toLocaleLowerCase() === key) {
        return category.id;
      }
    }
    return undefined;
  };

  for (const item of items) {
    let categoryId = findCategoryIdByName(item.categoryName);
    if (!categoryId) {
      categoryId = makeCategoryId();
      state = addCategory(state, {
        id: categoryId,
        name: item.categoryName.trim(),
        color: PRESET_COLORS[state.categoryOrder.length % PRESET_COLORS.length],
        icon: "default"
      });
      createdCategories.push(item.categoryName.trim());
    }
    state = upsertChannelToCategory(state, item.channel, categoryId, now);
    importedCount += 1;
  }

  return { state, importedCount, createdCategories };
}

export function getChannelsForCategory(state: ExtensionState, categoryId: string): Channel[] {
  const channelIds =
    categoryId === UNCATEGORIZED_ID
      ? state.uncategorizedChannelIds
      : state.categories[categoryId]?.channelIds ?? [];
  return channelIds.map((id) => state.channels[id]).filter(Boolean);
}

const queryTokens = (query: string): string[] => query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);

const channelMatchesTokens = (channel: Channel, tokens: string[]): boolean => {
  const target = `${channel.name} ${channel.handle ?? ""}`.toLocaleLowerCase();
  return tokens.every((token) => target.includes(token));
};

export function searchChannels(channels: Channel[], query: string): Channel[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    return channels;
  }
  return channels.filter((channel) => channelMatchesTokens(channel, tokens));
}

export interface ChannelSearchHit {
  channel: Channel;
  categoryId: string;
  categoryName: string;
}

export function searchAllChannels(state: ExtensionState, query: string): ChannelSearchHit[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    return [];
  }
  const hits: ChannelSearchHit[] = [];
  for (const categoryId of [UNCATEGORIZED_ID, ...state.categoryOrder]) {
    const category = state.categories[categoryId];
    if (!category) {
      continue;
    }
    for (const channel of getChannelsForCategory(state, categoryId)) {
      if (channelMatchesTokens(channel, tokens)) {
        hits.push({ channel, categoryId, categoryName: category.name });
      }
    }
  }
  return hits;
}

export function setCategoryAppearance(
  currentState: ExtensionState,
  categoryId: string,
  appearance: Pick<Category, "color" | "icon">
): ExtensionState {
  if (categoryId === UNCATEGORIZED_ID) {
    throw new Error("Cannot edit system category appearance");
  }
  const state = cloneState(currentState);
  const category = state.categories[categoryId];
  if (!category) {
    throw new Error(`Category not found: ${categoryId}`);
  }
  category.color = appearance.color;
  category.icon = appearance.icon;
  return state;
}

export function setSidebarMode(currentState: ExtensionState, mode: ExtensionState["ui"]["sidebarMode"]): ExtensionState {
  const state = cloneState(currentState);
  state.ui.sidebarMode = mode;
  return state;
}

/**
 * Real YouTube channel ids always start with "UC". Channels can also be
 * stored under a synthetic `handle:xxx` fallback id (see youtube-parser.ts)
 * before a full subscription sync resolves the canonical id; those aren't
 * usable with the public feed endpoint, which only accepts channel ids.
 */
export function isFeedTrackableChannelId(channelId: string): boolean {
  return channelId.startsWith("UC");
}

export function channelHasNewVideo(channel: Channel): boolean {
  return (
    typeof channel.latestVideoAt === "number" &&
    typeof channel.seenVideoAt === "number" &&
    channel.latestVideoAt > channel.seenVideoAt
  );
}

/**
 * Marks a channel's current latest video as acknowledged, clearing its dot.
 * Falls back to `now` if we haven't learned a latest-video timestamp yet, so
 * a manual open still counts as "seen" once a feed check eventually runs.
 */
export function markChannelSeen(currentState: ExtensionState, channelId: string, now = Date.now()): ExtensionState {
  const channel = currentState.channels[channelId];
  if (!channel) {
    return currentState;
  }
  const state = cloneState(currentState);
  state.channels[channelId] = {
    ...channel,
    seenVideoAt: channel.latestVideoAt ?? now
  };
  return state;
}

/**
 * Records the result of polling one channel's feed. The first time a channel
 * gets a result, `seenVideoAt` is seeded to that same timestamp so existing
 * subscriptions don't all light up as "new" the moment tracking turns on —
 * only uploads published after that baseline will show a dot.
 */
export function applyFeedCheckResult(
  currentState: ExtensionState,
  channelId: string,
  latestVideoAt: number | undefined,
  checkedAt = Date.now()
): ExtensionState {
  const channel = currentState.channels[channelId];
  if (!channel) {
    return currentState;
  }
  const state = cloneState(currentState);
  const nextLatestVideoAt = latestVideoAt ?? channel.latestVideoAt;
  state.channels[channelId] = {
    ...channel,
    feedCheckedAt: checkedAt,
    ...(nextLatestVideoAt === undefined ? {} : { latestVideoAt: nextLatestVideoAt }),
    seenVideoAt: channel.seenVideoAt ?? nextLatestVideoAt
  };
  return state;
}

/**
 * Picks up to `limit` trackable channels to poll next, prioritizing the ones
 * checked least recently (or never). Used to spread feed polling across
 * repeated alarm ticks instead of fetching every subscription at once.
 */
export function pickChannelsForFeedCheck(state: ExtensionState, limit: number): Channel[] {
  return Object.values(state.channels)
    .filter((channel) => isFeedTrackableChannelId(channel.id))
    .sort((a, b) => (a.feedCheckedAt ?? 0) - (b.feedCheckedAt ?? 0))
    .slice(0, limit);
}

export function toggleCategoryExpanded(currentState: ExtensionState, categoryId: string): ExtensionState {
  const state = cloneState(currentState);
  const expanded = new Set(state.ui.expandedCategoryIds);
  if (expanded.has(categoryId)) {
    expanded.delete(categoryId);
  } else {
    expanded.add(categoryId);
  }
  state.ui.expandedCategoryIds = Array.from(expanded);
  return state;
}

export function applyLegacyImportIfNeeded(
  currentState: ExtensionState,
  legacyData: LegacyImportData
): ExtensionState {
  const hasPlaceholderData = hasPlaceholderRecoveryData(currentState);
  if (currentState.importedLegacyData && !hasPlaceholderData) {
    return upgradeRecoveredCategoryAppearance(currentState);
  }

  const state = cloneState(currentState);
  if (state.categoryOrder.length > 0 && !hasPlaceholderData) {
    state.importedLegacyData = true;
    return state;
  }

  const channels: Record<string, Channel> = Object.fromEntries(
    legacyData.channels.map((item) => [item.id, normalizeChannel(item)])
  );
  const categories: Record<string, Category> = {
    [UNCATEGORIZED_ID]: cloneCategory(UNCATEGORIZED_CATEGORY)
  };

  for (const category of legacyData.categories) {
    const appearance = RECOVERED_CATEGORY_APPEARANCE[category.name.trim().toLocaleLowerCase()];
    categories[category.id] = {
      id: category.id,
      name: category.name,
      color: appearance?.color ?? category.color,
      icon: appearance?.icon ?? category.icon,
      channelIds: unique(category.channelIds).filter((id) => channels[id])
    };
  }

  return {
    ...state,
    channels,
    categories,
    categoryOrder: legacyData.categories.map((category) => category.id),
    uncategorizedChannelIds: unique(legacyData.uncategorizedChannelIds).filter((id) => channels[id]),
    ui: {
      sidebarMode: "categorized",
      expandedCategoryIds: [UNCATEGORIZED_ID, ...legacyData.categories.map((category) => category.id)]
    },
    importedLegacyData: true
  };
}
