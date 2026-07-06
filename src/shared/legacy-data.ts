import type { LegacyImportData } from "./types";

// Public builds must not ship a real user's recovered subscription data.
// Keep this empty; tests pass explicit fixtures when they need to cover import behavior.
export const LEGACY_IMPORT_DATA = {
  channels: [],
  categories: [],
  uncategorizedChannelIds: []
} satisfies LegacyImportData;
