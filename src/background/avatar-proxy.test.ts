import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAvatarDataUrl } from "./avatar-proxy";

describe("fetchAvatarDataUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches allowed YouTube avatar URLs as data URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "image/png" }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
      })
    );

    const result = await fetchAvatarDataUrl("https://yt3.googleusercontent.com/avatar=s88-c");

    expect(result).toEqual({ ok: true, dataUrl: "data:image/png;base64,AQID" });
  });

  it("rejects non-avatar origins", async () => {
    const result = await fetchAvatarDataUrl("https://example.com/avatar.png");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Unsupported avatar URL/);
    }
  });
});
