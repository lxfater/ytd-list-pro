import type { CategoryIconId } from "./types";

export const STATE_SCHEMA_VERSION = 1;

export const UNCATEGORIZED_ID = "uncategorized";

export const UNCATEGORIZED_CATEGORY = {
  id: UNCATEGORIZED_ID,
  name: "未分类",
  color: "#737373",
  icon: "default" as CategoryIconId,
  channelIds: [] as string[],
  isSystem: true
};

export const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b"
];

export const CATEGORY_ICONS: Array<{ id: CategoryIconId; label: string }> = [
  { id: "default", label: "默认" },
  { id: "open", label: "打开" },
  { id: "video", label: "视频" },
  { id: "channel", label: "频道" },
  { id: "ai", label: "AI" },
  { id: "code", label: "代码" },
  { id: "learning", label: "学习" },
  { id: "music", label: "音乐" },
  { id: "idea", label: "灵感" },
  { id: "interview", label: "访谈" }
];

export const RECOVERED_CATEGORY_APPEARANCE: Record<string, { color: string; icon: CategoryIconId }> = {
  ai: { color: "#7c3aed", icon: "ai" },
  ytb: { color: "#ef4444", icon: "channel" },
  general: { color: "#0ea5e9", icon: "idea" },
  aitalk: { color: "#14b8a6", icon: "interview" },
  edting: { color: "#f97316", icon: "video" }
};
