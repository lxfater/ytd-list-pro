import type { Channel } from "./types";
import { normalizeAvatarUrl } from "./avatar";

const YOUTUBE_ORIGIN = "https://www.youtube.com";

const getAbsoluteUrl = (href: string): string | undefined => {
  try {
    return new URL(href, YOUTUBE_ORIGIN).href;
  } catch {
    return undefined;
  }
};

const getPathname = (href: string): string | undefined => {
  try {
    return new URL(href, YOUTUBE_ORIGIN).pathname;
  } catch {
    return undefined;
  }
};

export const getChannelIdFromPath = (pathname: string): string | undefined => {
  const match = pathname.match(/^\/channel\/([^/?#]+)/);
  return match?.[1];
};

export const getHandleFromPath = (pathname: string): string | undefined => {
  const match = pathname.match(/^\/(@[^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
};

const cleanText = (value: string | null | undefined): string => value?.replace(/\s+/g, " ").trim() ?? "";

const getClosestChannelId = (anchor: HTMLAnchorElement): string | undefined => {
  const container = anchor.closest("[data-channel-external-id], [data-channel-id]");
  return (
    anchor.dataset.channelId ||
    anchor.dataset.channelExternalId ||
    container?.getAttribute("data-channel-external-id") ||
    container?.getAttribute("data-channel-id") ||
    undefined
  );
};

const getChannelName = (anchor: HTMLAnchorElement): string => {
  const textNode = anchor.querySelector("#text, yt-formatted-string, span");
  const aria = anchor.getAttribute("aria-label");
  return cleanText(textNode?.textContent) || cleanText(aria) || cleanText(anchor.textContent) || "未命名频道";
};

const getAvatarUrl = (anchor: HTMLAnchorElement): string | undefined => {
  const image = anchor.querySelector("img");
  return normalizeAvatarUrl(image?.getAttribute("src") || image?.getAttribute("data-thumb") || undefined);
};

export function parseSubscriptionsFromDocument(root: ParentNode = document): Channel[] {
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="/@"], a[href^="/channel/"], a[href*="youtube.com/@"]'));
  const channels: Channel[] = [];
  const seen = new Set<string>();

  for (const anchor of anchors) {
    const href = anchor.getAttribute("href");
    if (!href) {
      continue;
    }

    const url = getAbsoluteUrl(href);
    const pathname = getPathname(href);
    if (!url || !pathname) {
      continue;
    }

    const handle = getHandleFromPath(pathname);
    const id = getClosestChannelId(anchor) || getChannelIdFromPath(pathname) || (handle ? `handle:${handle.slice(1).toLocaleLowerCase()}` : undefined);

    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    channels.push({
      id,
      name: getChannelName(anchor),
      avatarUrl: getAvatarUrl(anchor),
      handle,
      url
    });
  }

  return channels;
}
