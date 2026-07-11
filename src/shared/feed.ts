const FEED_BASE_URL = "https://www.youtube.com/feeds/videos.xml";

/**
 * YouTube exposes a public, unauthenticated Atom feed of a channel's most
 * recent uploads. It only accepts canonical `UC...` channel ids (not @handles),
 * so callers should filter with `isFeedTrackableChannelId` from shared/state
 * before building a URL.
 */
export function buildChannelFeedUrl(channelId: string): string {
  return `${FEED_BASE_URL}?channel_id=${encodeURIComponent(channelId)}`;
}

/**
 * Extracts the newest `<published>` timestamp from a channel's Atom feed XML.
 * Uses a plain regex instead of DOMParser/XML parsing because this also runs
 * inside the MV3 background service worker, which has no DOM available.
 */
export function parseLatestVideoTimestamp(xml: string): number | undefined {
  const pattern = /<published>([^<]+)<\/published>/g;
  let latest: number | undefined;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const time = Date.parse(match[1]);
    if (Number.isFinite(time) && (latest === undefined || time > latest)) {
      latest = time;
    }
  }
  return latest;
}

/**
 * Fetches and parses a single channel's feed. Never throws: network errors,
 * non-2xx responses, or unparsable bodies all resolve to `undefined` so a
 * batch check can skip a failing channel without aborting the others.
 */
export async function fetchLatestVideoTimestamp(
  channelId: string,
  fetchImpl: typeof fetch = fetch
): Promise<number | undefined> {
  try {
    const response = await fetchImpl(buildChannelFeedUrl(channelId), { credentials: "omit" });
    if (!response.ok) {
      return undefined;
    }
    const xml = await response.text();
    return parseLatestVideoTimestamp(xml);
  } catch {
    return undefined;
  }
}
