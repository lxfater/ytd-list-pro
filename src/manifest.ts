import { AVATAR_HOST_PERMISSIONS } from "./shared/avatar";

export const manifest: chrome.runtime.ManifestV3 = {
  manifest_version: 3,
  name: "YTD List Pro",
  version: "0.1.0",
  description: "Organize YouTube subscriptions into visual categories.",
  permissions: ["storage", "tabs", "scripting", "alarms"],
  host_permissions: ["https://www.youtube.com/*", ...AVATAR_HOST_PERMISSIONS],
  content_security_policy: {
    extension_pages:
      "script-src 'self'; object-src 'self'; img-src 'self' data: https://yt3.googleusercontent.com https://yt3.ggpht.com;"
  },
  action: {
    default_title: "YTD List Pro",
    default_icon: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  background: {
    service_worker: "assets/background.js",
    type: "module"
  },
  content_scripts: [
    {
      matches: ["https://www.youtube.com/*"],
      js: ["assets/page-reader.js"],
      run_at: "document_idle",
      world: "MAIN"
    },
    {
      matches: ["https://www.youtube.com/*"],
      js: ["assets/content.js"],
      run_at: "document_idle",
      world: "ISOLATED"
    }
  ],
  icons: {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
};
