import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("popup shell sizing", () => {
  it("keeps the extension popup below browser height limits and disables outer scrolling", async () => {
    const css = await readFile("src/popup/App.css", "utf8");

    expect(css).toContain("height: 580px;");
    expect(css).toMatch(/html,\s*body,\s*#root\s*{[\s\S]*overflow: hidden;/);
    expect(css).not.toContain("height: 620px;");
  });
});
