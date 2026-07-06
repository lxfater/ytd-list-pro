import { describe, expect, it, vi } from "vitest";
import { injectSubscriptionScripts, isMissingContentScript } from "./tab-refresh";

describe("tab refresh script injection", () => {
  it("recognizes the Chrome error for an already-open tab without the content script", () => {
    expect(isMissingContentScript(new Error("Could not establish connection. Receiving end does not exist."))).toBe(true);
    expect(isMissingContentScript({ message: "Receiving end does not exist." })).toBe(true);
    expect(isMissingContentScript(new Error("Different failure"))).toBe(false);
  });

  it("injects the page-session reader before the isolated content script", async () => {
    const executeScript = vi.fn().mockResolvedValue([]);

    await injectSubscriptionScripts(42, { executeScript });

    expect(executeScript).toHaveBeenNthCalledWith(1, {
      target: { tabId: 42 },
      files: ["assets/page-reader.js"],
      world: "MAIN"
    });
    expect(executeScript).toHaveBeenNthCalledWith(2, {
      target: { tabId: 42 },
      files: ["assets/content.js"],
      world: "ISOLATED"
    });
  });
});
