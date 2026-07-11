import { describe, expect, it, vi } from "vitest";
import { buildChannelFeedUrl, fetchLatestVideoTimestamp, parseLatestVideoTimestamp } from "./feed";

const sampleFeed = (published: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Sample channel</title>
  ${published
    .map(
      (value) => `<entry>
    <id>yt:video:sample</id>
    <published>${value}</published>
  </entry>`
    )
    .join("\n")}
</feed>`;

describe("buildChannelFeedUrl", () => {
  it("builds the public per-channel Atom feed URL", () => {
    expect(buildChannelFeedUrl("UC-abc")).toBe("https://www.youtube.com/feeds/videos.xml?channel_id=UC-abc");
  });

  it("encodes special characters in the channel id", () => {
    expect(buildChannelFeedUrl("UC a/b")).toBe("https://www.youtube.com/feeds/videos.xml?channel_id=UC%20a%2Fb");
  });
});

describe("parseLatestVideoTimestamp", () => {
  it("returns the newest published timestamp among multiple entries", () => {
    const xml = sampleFeed(["2026-01-01T00:00:00+00:00", "2026-03-15T12:30:00+00:00", "2025-12-01T00:00:00+00:00"]);
    expect(parseLatestVideoTimestamp(xml)).toBe(Date.parse("2026-03-15T12:30:00+00:00"));
  });

  it("returns undefined for a feed with no entries", () => {
    expect(parseLatestVideoTimestamp(sampleFeed([]))).toBeUndefined();
  });

  it("ignores unparsable published values", () => {
    expect(parseLatestVideoTimestamp(sampleFeed(["not-a-date"]))).toBeUndefined();
  });
});

describe("fetchLatestVideoTimestamp", () => {
  it("returns the latest timestamp on a successful response", async () => {
    const xml = sampleFeed(["2026-05-01T00:00:00+00:00"]);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => xml });
    const result = await fetchLatestVideoTimestamp("UC-abc", fetchImpl as unknown as typeof fetch);
    expect(result).toBe(Date.parse("2026-05-01T00:00:00+00:00"));
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC-abc",
      expect.objectContaining({ credentials: "omit" })
    );
  });

  it("returns undefined on a non-ok response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, text: async () => "" });
    const result = await fetchLatestVideoTimestamp("UC-abc", fetchImpl as unknown as typeof fetch);
    expect(result).toBeUndefined();
  });

  it("returns undefined instead of throwing on a network error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await fetchLatestVideoTimestamp("UC-abc", fetchImpl as unknown as typeof fetch);
    expect(result).toBeUndefined();
  });
});
