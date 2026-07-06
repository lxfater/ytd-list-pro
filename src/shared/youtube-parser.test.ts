import { describe, expect, it } from "vitest";
import { parseSubscriptionsFromDocument } from "./youtube-parser";

describe("parseSubscriptionsFromDocument", () => {
  it("extracts channel id, name, avatar, handle, and url from YouTube guide entries", () => {
    document.body.innerHTML = `
      <ytd-guide-entry-renderer data-channel-external-id="UCabc123">
        <a id="endpoint" href="/@alpha">
          <img id="img" src="https://yt3.ggpht.com/avatar-alpha=s88-c-k-c0x00ffffff-no-rj">
          <span id="text">Alpha Channel</span>
        </a>
      </ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer>
        <a id="endpoint" href="/channel/UCdef456">
          <img id="img" src="https://yt3.ggpht.com/avatar-beta=s88-c-k-c0x00ffffff-no-rj">
          <span id="text">Beta Channel</span>
        </a>
      </ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer data-channel-id="UCabc123">
        <a id="endpoint" href="/@alpha">
          <span id="text">Alpha Channel duplicate</span>
        </a>
      </ytd-guide-entry-renderer>
    `;

    const channels = parseSubscriptionsFromDocument(document);

    expect(channels).toEqual([
      {
        id: "UCabc123",
        name: "Alpha Channel",
        avatarUrl: "https://yt3.ggpht.com/avatar-alpha=s88-c-k-c0x00ffffff-no-rj",
        handle: "@alpha",
        url: "https://www.youtube.com/@alpha"
      },
      {
        id: "UCdef456",
        name: "Beta Channel",
        avatarUrl: "https://yt3.ggpht.com/avatar-beta=s88-c-k-c0x00ffffff-no-rj",
        handle: undefined,
        url: "https://www.youtube.com/channel/UCdef456"
      }
    ]);
  });
});
