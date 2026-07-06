import type { Channel } from "./types";
import { normalizeAvatarUrl } from "./avatar";

type LooseObject = Record<string, unknown>;

const YOUTUBE_ORIGIN = "https://www.youtube.com";

const isObject = (value: unknown): value is LooseObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const textValue = (value: unknown): string => {
  if (!isObject(value)) {
    return "";
  }
  if (typeof value.simpleText === "string") {
    return value.simpleText.trim();
  }
  if (Array.isArray(value.runs)) {
    return value.runs
      .map((run) => (isObject(run) && typeof run.text === "string" ? run.text : ""))
      .join("")
      .trim();
  }
  return "";
};

const nested = (value: unknown, path: string[]): unknown =>
  path.reduce<unknown>((current, segment) => (isObject(current) ? current[segment] : undefined), value);

const lastThumbnailUrl = (value: unknown): string | undefined => {
  if (!isObject(value) || !Array.isArray(value.thumbnails)) {
    return undefined;
  }
  const last = value.thumbnails.at(-1);
  return isObject(last) && typeof last.url === "string" ? last.url : undefined;
};

const asBrowseEndpoint = (renderer: LooseObject): LooseObject | undefined => {
  const endpoint = nested(renderer, ["navigationEndpoint", "browseEndpoint"]);
  return isObject(endpoint) ? endpoint : undefined;
};

const normalizeRelativeUrl = (path: string): string => {
  try {
    return new URL(path, YOUTUBE_ORIGIN).href;
  } catch {
    return `${YOUTUBE_ORIGIN}/`;
  }
};

const channelIdFromUrlPath = (path: string): string | undefined => {
  const match = path.match(/^\/channel\/([^/?#]+)/);
  return match?.[1];
};

const handleFromUrlPath = (path: unknown): string | undefined => {
  if (typeof path !== "string" || !path.startsWith("/@")) {
    return undefined;
  }
  return decodeURIComponent(path.slice(1));
};

const channelFromRenderer = (renderer: unknown): Channel | undefined => {
  if (!isObject(renderer)) {
    return undefined;
  }
  const endpoint = asBrowseEndpoint(renderer);
  const canonicalPath = typeof endpoint?.canonicalBaseUrl === "string" ? endpoint.canonicalBaseUrl : undefined;
  const id =
    (typeof renderer.channelId === "string" && renderer.channelId) ||
    (typeof endpoint?.browseId === "string" && endpoint.browseId) ||
    (canonicalPath ? channelIdFromUrlPath(canonicalPath) : undefined);

  if (!id) {
    return undefined;
  }

  const name =
    textValue(renderer.title) ||
    textValue(renderer.shortBylineText) ||
    textValue(renderer.longBylineText) ||
    textValue(renderer.ownerText) ||
    textValue(renderer.channelTitle) ||
    "Unknown channel";

  const handle = handleFromUrlPath(canonicalPath);
  const avatarUrl = normalizeAvatarUrl(
    lastThumbnailUrl(renderer.thumbnail) ||
      lastThumbnailUrl(renderer.avatar) ||
      lastThumbnailUrl(nested(renderer, ["channelThumbnailSupportedRenderers", "channelThumbnailWithLinkRenderer", "thumbnail"]))
  );

  return {
    id,
    name,
    handle,
    avatarUrl,
    url: handle ? normalizeRelativeUrl(`/${handle}`) : normalizeRelativeUrl(`/channel/${id}`)
  };
};

const rendererKeys = ["channelRenderer", "gridChannelRenderer", "compactChannelRenderer"];

export function collectSessionChannels(payload: unknown): Channel[] {
  const found = new Map<string, Channel>();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (!isObject(value)) {
      return;
    }
    for (const key of rendererKeys) {
      const channel = channelFromRenderer(value[key]);
      if (channel && !found.has(channel.id)) {
        found.set(channel.id, channel);
      }
    }
    for (const child of Object.values(value)) {
      visit(child);
    }
  };

  visit(payload);
  return Array.from(found.values());
}

export function pickContinuationToken(payload: unknown): string | undefined {
  let token: string | undefined;

  const visit = (value: unknown): void => {
    if (token) {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (!isObject(value)) {
      return;
    }

    const nestedToken =
      nested(value, ["continuationItemRenderer", "continuationEndpoint", "continuationCommand", "token"]) ||
      nested(value, ["continuationEndpoint", "continuationCommand", "token"]);

    if (typeof nestedToken === "string" && nestedToken) {
      token = nestedToken;
      return;
    }

    for (const child of Object.values(value)) {
      visit(child);
    }
  };

  visit(payload);
  return token;
}
