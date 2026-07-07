import { fetchLatestVideoTimestamp } from "../shared/feed";
import { applyFeedCheckResult, pickChannelsForFeedCheck } from "../shared/state";
import { configureStorageAccount, loadActiveAccountId, loadState, saveState, type ExtensionStorageArea } from "../shared/storage";
import type { ExtensionState } from "../shared/types";

export const FEED_CHECK_ALARM_NAME = "ytdlp-feed-check";
export const FEED_CHECK_INTERVAL_MINUTES = 15;
export const FEED_CHECK_BATCH_SIZE = 30;
const FEED_CHECK_CONCURRENCY = 5;
// Even across many alarm ticks, don't re-check a channel more often than
// this — avoids hammering YouTube when the user only has a few subscriptions.
const MIN_RECHECK_INTERVAL_MS = 10 * 60 * 1000;

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const lane = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

/**
 * Polls a small batch of the least-recently-checked channels' RSS feeds and
 * saves any new "latest video" timestamps back to storage. Intended to be
 * called from a chrome.alarms tick so a large subscription list gets swept
 * gradually across many short runs instead of one long-running fetch storm
 * (MV3 service workers can be killed mid-task, so short runs are safer).
 */
export async function runFeedCheck(
  storageArea?: ExtensionStorageArea,
  fetchImpl: typeof fetch = fetch,
  now = Date.now()
): Promise<ExtensionState | undefined> {
  // The background service worker runs in its own JS module instance,
  // separate from the content script that normally calls activateAccount()
  // when it detects the signed-in YouTube account. Without this, the
  // background's in-memory activeAccountId stays stuck on "default" forever
  // and every read/write here silently targets the wrong per-account
  // storage key. STORAGE_ACTIVE_ACCOUNT_KEY is persisted to chrome.storage
  // by the content script, so re-syncing from it here (every run, in case
  // the user switches accounts) picks up the real key.
  const accountId = await loadActiveAccountId(storageArea);
  configureStorageAccount(accountId);

  const state = await loadState(storageArea);
  const candidates = pickChannelsForFeedCheck(state, FEED_CHECK_BATCH_SIZE).filter(
    (channel) => now - (channel.feedCheckedAt ?? 0) >= MIN_RECHECK_INTERVAL_MS
  );
  if (candidates.length === 0) {
    return undefined;
  }

  const results = await runWithConcurrency(candidates, FEED_CHECK_CONCURRENCY, async (channel) => ({
    channelId: channel.id,
    latestVideoAt: await fetchLatestVideoTimestamp(channel.id, fetchImpl)
  }));

  let nextState = state;
  for (const result of results) {
    nextState = applyFeedCheckResult(nextState, result.channelId, result.latestVideoAt, now);
  }
  await saveState(nextState, storageArea);
  return nextState;
}
