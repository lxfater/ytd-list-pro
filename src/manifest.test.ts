import { describe, expect, it } from "vitest";
import { manifest } from "./manifest";

describe("extension manifest", () => {
  it("declares Manifest V3 permissions, YouTube content script, action button, background worker, and icons", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(expect.arrayContaining(["storage", "tabs", "scripting"]));
    expect(manifest.host_permissions).toEqual(
      expect.arrayContaining([
        "https://www.youtube.com/*",
        "https://yt3.googleusercontent.com/*",
        "https://yt3.ggpht.com/*"
      ])
    );
    expect(manifest.content_security_policy?.extension_pages).toContain("img-src");
    expect(manifest.content_security_policy?.extension_pages).toContain("https://yt3.googleusercontent.com");
    expect(manifest.content_security_policy?.extension_pages).toContain("data:");
    expect(manifest.action?.default_popup).toBeUndefined();
    expect(manifest.background?.service_worker).toBe("assets/background.js");
    expect(manifest.content_scripts?.[0]?.matches).toEqual(["https://www.youtube.com/*"]);
    expect(manifest.content_scripts?.[0]?.js).toEqual(["assets/page-reader.js"]);
    expect(manifest.content_scripts?.[0]?.world).toBe("MAIN");
    expect(manifest.content_scripts?.[1]?.js).toEqual(["assets/content.js"]);
    expect(manifest.content_scripts?.[1]?.world).toBe("ISOLATED");
    expect(manifest.icons?.["128"]).toBe("icons/icon-128.png");
  });
});
