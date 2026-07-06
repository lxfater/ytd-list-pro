import { describe, expect, it } from "vitest";
import {
  addCategory,
  applyLegacyImportIfNeeded,
  createEmptyState,
  deleteCategory,
  getChannelsForCategory,
  mergeSubscriptions,
  moveChannels,
  renameCategory,
  reorderCategories,
  getChannelCategoryId,
  searchAllChannels,
  searchChannels,
  upsertChannelToCategory
} from "./state";
import { UNCATEGORIZED_ID } from "./constants";
import type { Channel, LegacyImportData } from "./types";

const channel = (id: string, name = id): Channel => ({
  id,
  name,
  avatarUrl: `https://img.youtube.test/${id}.jpg`,
  handle: `@${id}`,
  url: `https://www.youtube.com/channel/${id}`
});

const sampleLegacyData: LegacyImportData = {
  channels: [
    channel("UC-sample-a", "Sample AI"),
    channel("UC-sample-b", "Sample Video"),
    channel("UC-sample-c", "Sample Talk")
  ],
  categories: [
    {
      id: "cat-ai",
      name: "AI",
      color: "#8b5cf6",
      icon: "open",
      channelIds: ["UC-sample-a"]
    },
    {
      id: "cat-talk",
      name: "AITalk",
      color: "#14b8a6",
      icon: "open",
      channelIds: ["UC-sample-c"]
    }
  ],
  uncategorizedChannelIds: ["UC-sample-b"]
};

describe("subscription merge", () => {
  it("keeps existing category relationships, adds new channels to uncategorized, and removes missing channels", () => {
    const initial = createEmptyState();
    const withChannels = mergeSubscriptions(initial, [channel("UC-a"), channel("UC-b")], 10);
    const withCategory = addCategory(withChannels, {
      id: "cat-learning",
      name: "Learning",
      color: "#3b82f6",
      icon: "learning"
    });
    const organized = moveChannels(withCategory, ["UC-a"], "cat-learning");

    const refreshed = mergeSubscriptions(
      organized,
      [channel("UC-a", "A updated"), channel("UC-c", "C new")],
      20
    );

    expect(refreshed.channels["UC-a"]?.name).toBe("A updated");
    expect(refreshed.categories["cat-learning"]?.channelIds).toEqual(["UC-a"]);
    expect(refreshed.uncategorizedChannelIds).toEqual(["UC-c"]);
    expect(refreshed.channels["UC-b"]).toBeUndefined();
    expect(refreshed.lastSyncedAt).toBe(20);
  });

  it("tracks the first local discovery time for newly seen subscriptions", () => {
    const initial = mergeSubscriptions(createEmptyState(), [channel("UC-old")], 10);
    const refreshed = mergeSubscriptions(initial, [channel("UC-old"), channel("UC-new")], 25);
    const withRemoteSubscriptionTime = mergeSubscriptions(
      refreshed,
      [{ ...channel("UC-new"), subscribedAt: 30 }],
      40
    );

    expect(refreshed.channels["UC-old"]?.discoveredAt).toBe(10);
    expect(refreshed.channels["UC-new"]?.discoveredAt).toBe(25);
    expect(withRemoteSubscriptionTime.channels["UC-new"]?.discoveredAt).toBe(25);
    expect(withRemoteSubscriptionTime.channels["UC-new"]?.subscribedAt).toBe(30);
  });
});

describe("category management", () => {
  it("creates, renames, deletes, and reorders categories while protecting uncategorized", () => {
    let state = createEmptyState();
    state = mergeSubscriptions(state, [channel("UC-a"), channel("UC-b")], 10);
    state = addCategory(state, { id: "cat-a", name: "Alpha", color: "#ef4444", icon: "video" });
    state = addCategory(state, { id: "cat-b", name: "Beta", color: "#22c55e", icon: "music" });
    state = moveChannels(state, ["UC-a"], "cat-a");
    state = renameCategory(state, "cat-a", "Renamed");
    state = reorderCategories(state, ["cat-b", "cat-a"]);

    expect(state.categoryOrder).toEqual(["cat-b", "cat-a"]);
    expect(state.categories["cat-a"]?.name).toBe("Renamed");

    state = deleteCategory(state, "cat-a");

    expect(state.categories["cat-a"]).toBeUndefined();
    expect(state.categoryOrder).toEqual(["cat-b"]);
    expect(state.uncategorizedChannelIds).toEqual(["UC-b", "UC-a"]);
    expect(() => deleteCategory(state, UNCATEGORIZED_ID)).toThrow(/system category/i);
  });

  it("allows a category name to be cleared while the user is editing", () => {
    let state = createEmptyState();
    state = addCategory(state, { id: "cat-draft", name: "新", color: "#ef4444", icon: "default" });

    const renamed = renameCategory(state, "cat-draft", "");

    expect(renamed.categories["cat-draft"]?.name).toBe("");
  });
});

describe("channel movement", () => {
  it("moves one or many channels into a target category without duplicates and can move back to uncategorized", () => {
    let state = createEmptyState();
    state = mergeSubscriptions(state, [channel("UC-a"), channel("UC-b"), channel("UC-c")], 10);
    state = addCategory(state, { id: "cat-work", name: "Work", color: "#0ea5e9", icon: "code" });

    state = moveChannels(state, ["UC-a", "UC-b", "UC-a"], "cat-work");
    expect(state.categories["cat-work"]?.channelIds).toEqual(["UC-a", "UC-b"]);
    expect(state.uncategorizedChannelIds).toEqual(["UC-c"]);

    state = moveChannels(state, ["UC-b"], UNCATEGORIZED_ID);
    expect(state.categories["cat-work"]?.channelIds).toEqual(["UC-a"]);
    expect(state.uncategorizedChannelIds).toEqual(["UC-c", "UC-b"]);
    expect(getChannelsForCategory(state, UNCATEGORIZED_ID).map((item) => item.id)).toEqual(["UC-c", "UC-b"]);
  });
});

describe("legacy import", () => {
  it("imports recovered data only when local state has no user categories and has not imported before", () => {
    const imported = applyLegacyImportIfNeeded(createEmptyState(), sampleLegacyData);

    expect(Object.keys(imported.channels)).toHaveLength(3);
    expect(imported.categoryOrder).toHaveLength(2);
    expect(imported.uncategorizedChannelIds).toEqual(["UC-sample-b"]);
    expect(imported.importedLegacyData).toBe(true);
    expect(Object.values(imported.channels).some((item) => item.name.startsWith("Recovered Channel"))).toBe(false);
    expect(Object.values(imported.channels).every((item) => item.avatarUrl?.startsWith("https://"))).toBe(true);
    expect(Object.values(imported.categories).find((category) => category.name === "AI")?.icon).toBe("ai");
    expect(Object.values(imported.categories).find((category) => category.name === "AITalk")?.icon).toBe("interview");

    const secondPass = applyLegacyImportIfNeeded(imported, sampleLegacyData);
    expect(secondPass).toEqual(imported);

    const userState = addCategory(createEmptyState(), {
      id: "cat-user",
      name: "User Category",
      color: "#a855f7",
      icon: "default"
    });

    const untouched = applyLegacyImportIfNeeded(userState, sampleLegacyData);
    expect(untouched.categoryOrder).toEqual(["cat-user"]);
    expect(Object.keys(untouched.channels)).toHaveLength(0);
    expect(untouched.importedLegacyData).toBe(true);
  });

  it("replaces the previous placeholder recovery dataset even after the import flag was set", () => {
    const placeholder = {
      ...createEmptyState(),
      importedLegacyData: true,
      channels: {
        UClegacy001: {
          id: "UClegacy001",
          name: "Recovered Channel 001",
          handle: "@recovered001",
          avatarUrl: "https://yt3.ggpht.com/recovered-001=s88-c-k-c0x00ffffff-no-rj",
          url: "https://www.youtube.com/channel/UClegacy001"
        }
      },
      uncategorizedChannelIds: ["UClegacy001"]
    };

    const migrated = applyLegacyImportIfNeeded(placeholder, sampleLegacyData);

    expect(migrated.channels.UClegacy001).toBeUndefined();
    expect(Object.keys(migrated.channels)).toHaveLength(3);
    expect(Object.values(migrated.channels).some((item) => item.name.startsWith("Recovered Channel"))).toBe(false);
  });

  it("upgrades old recovered category appearances without overwriting user-edited icons", () => {
    const state = {
      ...createEmptyState(),
      importedLegacyData: true,
      categories: {
        ...createEmptyState().categories,
        "cat-ai": {
          id: "cat-ai",
          name: "AI",
          color: "#8b5cf6",
          icon: "open" as const,
          channelIds: []
        },
        "cat-custom": {
          id: "cat-custom",
          name: "AITalk",
          color: "#111827",
          icon: "music" as const,
          channelIds: []
        }
      },
      categoryOrder: ["cat-ai", "cat-custom"]
    };

    const upgraded = applyLegacyImportIfNeeded(state, sampleLegacyData);

    expect(upgraded.categories["cat-ai"]?.icon).toBe("ai");
    expect(upgraded.categories["cat-custom"]?.icon).toBe("music");
    expect(upgraded.categories["cat-custom"]?.color).toBe("#111827");
  });
});

describe("searchChannels", () => {
  const channels = [
    channel("UC-a", "李永乐老师"),
    channel("UC-b", "Fireship"),
    channel("UC-c", "Coding Train")
  ];

  it("matches case-insensitive substrings of name and handle", () => {
    expect(searchChannels(channels, "fire")).toEqual([channels[1]]);
    expect(searchChannels(channels, "永乐")).toEqual([channels[0]]);
    expect(searchChannels(channels, "@uc-c")).toEqual([channels[2]]);
  });

  it("matches multiple whitespace-separated keywords in any order", () => {
    expect(searchChannels(channels, "train coding")).toEqual([channels[2]]);
    expect(searchChannels(channels, "老师 李")).toEqual([channels[0]]);
  });

  it("returns all channels for an empty or whitespace-only query", () => {
    expect(searchChannels(channels, "")).toEqual(channels);
    expect(searchChannels(channels, "   ")).toEqual(channels);
  });

  it("returns nothing when a keyword does not match", () => {
    expect(searchChannels(channels, "fireship 老师")).toEqual([]);
  });
});

describe("searchAllChannels", () => {
  const buildState = () => {
    const initial = createEmptyState();
    const withChannels = mergeSubscriptions(
      initial,
      [channel("UC-a", "李永乐老师"), channel("UC-b", "Fireship"), channel("UC-c", "Coding Train")],
      10
    );
    const withCategory = addCategory(withChannels, {
      id: "cat-dev",
      name: "编程",
      color: "#3b82f6",
      icon: "learning"
    });
    return moveChannels(withCategory, ["UC-b", "UC-c"], "cat-dev");
  };

  it("finds channels across every category and reports where they live", () => {
    const state = buildState();
    const hits = searchAllChannels(state, "fire");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.channel.id).toBe("UC-b");
    expect(hits[0]?.categoryId).toBe("cat-dev");
    expect(hits[0]?.categoryName).toBe("编程");
  });

  it("includes uncategorized channels in the results", () => {
    const hits = searchAllChannels(buildState(), "永乐");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.channel.id).toBe("UC-a");
    expect(hits[0]?.categoryId).toBe(UNCATEGORIZED_ID);
  });

  it("returns no hits for an empty query", () => {
    expect(searchAllChannels(buildState(), "  ")).toEqual([]);
  });
});

describe("upsertChannelToCategory", () => {
  const buildState = () => {
    const initial = createEmptyState();
    const withChannels = mergeSubscriptions(initial, [channel("UC-a", "Alpha")], 10);
    return addCategory(withChannels, { id: "cat-dev", name: "编程", color: "#3b82f6", icon: "learning" });
  };

  it("moves an already known channel into the category", () => {
    const state = upsertChannelToCategory(buildState(), channel("UC-a", "Alpha"), "cat-dev", 99);
    expect(getChannelCategoryId(state, "UC-a")).toBe("cat-dev");
    expect(state.uncategorizedChannelIds).not.toContain("UC-a");
  });

  it("matches an existing channel by handle when the page only exposes a handle id", () => {
    const pageChannel: Channel = {
      id: "handle:uc-a",
      name: "Alpha",
      handle: "@UC-a",
      url: "https://www.youtube.com/@UC-a"
    };
    const state = upsertChannelToCategory(buildState(), pageChannel, "cat-dev", 99);
    expect(getChannelCategoryId(state, "UC-a")).toBe("cat-dev");
    expect(state.channels["handle:uc-a"]).toBeUndefined();
  });

  it("adds a brand-new channel with subscription timestamps before categorizing it", () => {
    const fresh: Channel = {
      id: "handle:new",
      name: "New Channel",
      handle: "@new",
      url: "https://www.youtube.com/@new"
    };
    const state = upsertChannelToCategory(buildState(), fresh, "cat-dev", 12345);
    expect(getChannelCategoryId(state, "handle:new")).toBe("cat-dev");
    expect(state.channels["handle:new"]?.subscribedAt).toBe(12345);
    expect(state.channels["handle:new"]?.discoveredAt).toBe(12345);
  });

  it("keeps the category assignment when a later sync replaces the handle id with the canonical id", () => {
    const fresh: Channel = {
      id: "handle:new",
      name: "New Channel",
      handle: "@new",
      url: "https://www.youtube.com/@new"
    };
    const assigned = upsertChannelToCategory(buildState(), fresh, "cat-dev", 12345);
    const synced = mergeSubscriptions(
      assigned,
      [
        channel("UC-a", "Alpha"),
        { ...channel("UC-new", "New Channel"), handle: "@new" }
      ],
      20000
    );
    expect(synced.channels["handle:new"]).toBeUndefined();
    expect(getChannelCategoryId(synced, "UC-new")).toBe("cat-dev");
    expect(synced.channels["UC-new"]?.subscribedAt).toBe(12345);
  });

  it("keeps existing metadata and ignores placeholder names from the page", () => {
    const pageChannel: Channel = {
      id: "UC-a",
      name: "  ",
      url: "https://www.youtube.com/@UC-a"
    };
    const state = upsertChannelToCategory(buildState(), pageChannel, "cat-dev", 99);
    expect(state.channels["UC-a"]?.name).toBe("Alpha");
    expect(state.channels["UC-a"]?.handle).toBe("@UC-a");
  });
});
