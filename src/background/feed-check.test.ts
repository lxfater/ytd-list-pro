import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeSubscriptions, upsertChannelToCategory } from "../shared/state";
import {
  configureStorageAccount,
  createMemoryStorageArea,
  DEFAULT_ACCOUNT_ID,
  loadState,
  saveState,
  storageKeyForAccount,
  STORAGE_ACTIVE_ACCOUNT_KEY,
  STORAGE_STATE_KEY
} from "../shared/storage";
import { createEmptyState } from "../shared/state";
import { UNCATEGORIZED_ID } from "../shared/constants";
import type { Channel } from "../shared/types";
import { FEED_CHECK_BATCH_SIZE, runFeedCheck } from "./feed-check";

const channel = (id: string, name = id): Channel => ({
  id,
  name,
  handle: `@${id}`,
  url: `https://www.youtube.com/channel/${id}`
});

describe("runFeedCheck", () => {
  afterEach(() => {
    // runFeedCheck mutates the shared in-memory active-account variable in
    // shared/storage.ts as part of resolving the right storage key; reset it
    // so later tests (and other test files sharing this module instance)
    // aren't affected by whichever account the previous test resolved to.
    configureStorageAccount(DEFAULT_ACCOUNT_ID);
  });

  it("resolves the real active account instead of the background's default in-memory one", async () => {
    // Regression test: the background service worker has its own module
    // instance of shared/storage.ts, separate from the content script that
    // normally calls activateAccount() when it detects the signed-in
    // YouTube account. Before this fix, runFeedCheck always read/wrote the
    // default "ytdListProState" key and silently found zero channels for
    // any user on a non-default account.
    const accountId = "account-42";
    const accountState = mergeSubscriptions(createEmptyState(), [channel("UC-a")], 10);
    const storage = createMemoryStorageArea({
      [STORAGE_ACTIVE_ACCOUNT_KEY]: accountId,
      [storageKeyForAccount(accountId)]: accountState,
      // A stale default-account slot that must be left untouched.
      [STORAGE_STATE_KEY]: createEmptyState()
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => "<feed><entry><published>2026-01-01T00:00:00+00:00</published></entry></feed>" });

    await runFeedCheck(storage, fetchImpl as unknown as typeof fetch, 1_000_000);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const raw = await storage.get([storageKeyForAccount(accountId), STORAGE_STATE_KEY]);
    const updatedAccountState = raw[storageKeyForAccount(accountId)] as typeof accountState;
    const untouchedDefaultState = raw[STORAGE_STATE_KEY] as typeof accountState;
    expect(updatedAccountState.channels["UC-a"]?.latestVideoAt).toBeDefined();
    expect(Object.keys(untouchedDefaultState.channels)).toEqual([]);
  });

  it("does nothing when there are no trackable channels", async () => {
    const storage = createMemoryStorageArea();
    await saveState(createEmptyState(), storage);
    const fetchImpl = vi.fn();

    const result = await runFeedCheck(storage, fetchImpl as unknown as typeof fetch);

    expect(result).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetches trackable channels, saves the result, and skips handle-only ids", async () => {
    let state = mergeSubscriptions(createEmptyState(), [channel("UC-a"), channel("UC-b")], 10);
    state = upsertChannelToCategory(
      state,
      { id: "handle:solo", name: "Handle only", url: "https://www.youtube.com/@solo" },
      UNCATEGORIZED_ID
    );
    const storage = createMemoryStorageArea();
    await saveState(state, storage);

    const fetchImpl = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      text: async () =>
        url.includes("UC-a")
          ? "<feed><entry><published>2026-01-01T00:00:00+00:00</published></entry></feed>"
          : "<feed><entry><published>2026-02-01T00:00:00+00:00</published></entry></feed>"
    }));

    const result = await runFeedCheck(storage, fetchImpl as unknown as typeof fetch, 1_000_000);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result?.channels["UC-a"]?.latestVideoAt).toBe(Date.parse("2026-01-01T00:00:00+00:00"));
    expect(result?.channels["UC-b"]?.latestVideoAt).toBe(Date.parse("2026-02-01T00:00:00+00:00"));
    // First check for each channel: seenVideoAt seeds to latestVideoAt, no dot yet.
    expect(result?.channels["UC-a"]?.seenVideoAt).toBe(result?.channels["UC-a"]?.latestVideoAt);
    expect(result?.channels["handle:solo"]?.latestVideoAt).toBeUndefined();

    const persisted = await loadState(storage);
    expect(persisted.channels["UC-a"]?.feedCheckedAt).toBe(1_000_000);
  });

  it("skips channels that were checked too recently", async () => {
    let state = mergeSubscriptions(createEmptyState(), [channel("UC-a")], 10);
    const storage = createMemoryStorageArea();
    await saveState(state, storage);

    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => "<feed><entry><published>2026-01-01T00:00:00+00:00</published></entry></feed>" });

    await runFeedCheck(storage, fetchImpl as unknown as typeof fetch, 1_000_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Immediately after, well within the min-recheck window, should skip.
    const secondRun = await runFeedCheck(storage, fetchImpl as unknown as typeof fetch, 1_000_000 + 60_000);
    expect(secondRun).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("caps the batch size per run", async () => {
    const channels = Array.from({ length: FEED_CHECK_BATCH_SIZE + 10 }, (_, index) => channel(`UC-${index}`));
    const state = mergeSubscriptions(createEmptyState(), channels, 10);
    const storage = createMemoryStorageArea();
    await saveState(state, storage);

    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => "<feed></feed>" });
    await runFeedCheck(storage, fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledTimes(FEED_CHECK_BATCH_SIZE);
  });
});
