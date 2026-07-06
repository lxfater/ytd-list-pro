import { describe, expect, it } from "vitest";
import { isAllowedAvatarUrl, normalizeAvatarUrl } from "./avatar";

describe("avatar URLs", () => {
  it("normalizes YouTube thumbnail URLs and rejects unrelated origins", () => {
    expect(normalizeAvatarUrl("//yt3.googleusercontent.com/avatar=s88-c")).toBe(
      "https://yt3.googleusercontent.com/avatar=s88-c"
    );
    expect(normalizeAvatarUrl("http://yt3.ggpht.com/avatar=s88-c")).toBe("https://yt3.ggpht.com/avatar=s88-c");
    expect(isAllowedAvatarUrl("https://yt3.googleusercontent.com/avatar=s88-c")).toBe(true);
    expect(isAllowedAvatarUrl("https://example.com/avatar.png")).toBe(false);
  });
});
