export type CategoryIconId =
  | "default"
  | "open"
  | "video"
  | "channel"
  | "ai"
  | "code"
  | "learning"
  | "music"
  | "idea"
  | "interview";

export interface Channel {
  id: string;
  name: string;
  avatarUrl?: string;
  handle?: string;
  url: string;
  subscribedAt?: number;
  discoveredAt?: number;
  /** Timestamp (ms) of the newest video found the last time we checked the channel's feed. */
  latestVideoAt?: number;
  /** Timestamp (ms) of the newest video the user has acknowledged (dot clears at/above this). */
  seenVideoAt?: number;
  /** Timestamp (ms) we last polled this channel's feed, used to round-robin checks. */
  feedCheckedAt?: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: CategoryIconId;
  channelIds: string[];
  isSystem?: boolean;
}

export type SidebarMode = "original" | "categorized";

export type ChannelSortMode = "added-desc" | "added-asc" | "name-asc" | "name-desc" | "manual";

export interface ExtensionState {
  schemaVersion: number;
  channels: Record<string, Channel>;
  categories: Record<string, Category>;
  categoryOrder: string[];
  uncategorizedChannelIds: string[];
  ui: {
    sidebarMode: SidebarMode;
    expandedCategoryIds: string[];
  };
  importedLegacyData: boolean;
  lastSyncedAt?: number;
}

export interface CategoryInput {
  id: string;
  name: string;
  color: string;
  icon: CategoryIconId;
}

export interface LegacyImportData {
  channels: Channel[];
  categories: Array<CategoryInput & { channelIds: string[] }>;
  uncategorizedChannelIds: string[];
}
