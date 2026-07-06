import { collectSessionChannels, pickContinuationToken } from "../shared/youtube-session";
import type { Channel } from "../shared/types";

const MESSAGE_MARK = "YTD_LIST_PRO_SESSION_SYNC";
const REQUEST_KIND = "request-subscriptions";
const RESPONSE_KIND = "subscription-result";
const CLEANUP_KEY = "__YTD_LIST_PRO_PAGE_READER_CLEANUP__";
const MAX_REQUESTS = 30;
const SUBSCRIPTIONS_PAGE_ID = "FEchannels";
const YOUTUBE_ORIGIN = "https://www.youtube.com";

type PageConfig = {
  get?: (key: string) => unknown;
  [key: string]: unknown;
};

type PageWindow = Window & {
  ytcfg?: PageConfig;
  yt?: {
    config_?: PageConfig;
  };
  [CLEANUP_KEY]?: () => void;
};

const pageWindow = window as PageWindow;

const readConfig = (config: PageConfig, key: string): unknown =>
  typeof config.get === "function" ? config.get(key) : config[key];

const getPageConfig = (): PageConfig => {
  const config = pageWindow.ytcfg ?? pageWindow.yt?.config_;
  if (!config) {
    throw new Error("找不到 YouTube 页面配置。请刷新 YouTube 页面后再试。");
  }
  return config;
};

const getCookieValue = (name: string): string | undefined => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
};

const sessionCookie = (): string => {
  const value =
    getCookieValue("SAPISID") ||
    getCookieValue("__Secure-3PAPISID") ||
    getCookieValue("__Secure-1PAPISID");
  if (!value) {
    throw new Error("没有找到 YouTube 登录 cookie。请确认当前 YouTube 标签页已登录账号。");
  }
  return value;
};

const hexSha1 = async (input: string): Promise<string> => {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const signedSession = async (secret: string): Promise<string> => {
  const seconds = Math.floor(Date.now() / 1000);
  const signature = await hexSha1(`${seconds} ${secret} ${YOUTUBE_ORIGIN}`);
  return `${seconds}_${signature}`;
};

const stringConfig = (config: PageConfig, key: string, fallback = ""): string => {
  const value = readConfig(config, key);
  return value === undefined || value === null ? fallback : String(value);
};

const requestHeaders = (config: PageConfig, sessionSignature: string): Record<string, string> => {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `SAPISIDHASH ${sessionSignature}`,
    "x-youtube-client-name": stringConfig(config, "INNERTUBE_CONTEXT_CLIENT_NAME"),
    "x-youtube-client-version": stringConfig(config, "INNERTUBE_CONTEXT_CLIENT_VERSION"),
    "x-goog-authuser": stringConfig(config, "SESSION_INDEX", "0"),
    "x-goog-visitor-id": stringConfig(config, "VISITOR_DATA") || stringConfig(config, "visitorData")
  };

  const optionalHeaders: Array<[string, string]> = [
    ["x-goog-pageid", "DELEGATED_SESSION_ID"],
    ["x-youtube-identity-token", "ID_TOKEN"],
    ["x-youtube-page-cl", "PAGE_CL"],
    ["x-youtube-page-label", "PAGE_BUILD_LABEL"],
    ["x-youtube-device", "DEVICE"],
    ["accept-language", "accept_language"]
  ];

  for (const [headerName, configKey] of optionalHeaders) {
    const value = stringConfig(config, configKey);
    if (value) {
      headers[headerName] = value;
    }
  }

  return headers;
};

const requestContext = (config: PageConfig) => ({
  client: {
    clientName: readConfig(config, "INNERTUBE_CONTEXT_CLIENT_NAME"),
    clientVersion: readConfig(config, "INNERTUBE_CONTEXT_CLIENT_VERSION"),
    hl: readConfig(config, "INNERTUBE_CONTEXT_HL") || readConfig(config, "HL"),
    gl: readConfig(config, "INNERTUBE_CONTEXT_GL") || readConfig(config, "GL")
  },
  request: {
    internalExperimentFlags: [],
    consistencyTokenJars: []
  }
});

const fetchBrowsePage = async (
  config: PageConfig,
  sessionSignature: string,
  continuation?: string
): Promise<unknown> => {
  const apiKey = stringConfig(config, "INNERTUBE_API_KEY");
  if (!apiKey) {
    throw new Error("YouTube 页面缺少内部 API key。请刷新页面后再试。");
  }

  const body = continuation
    ? { context: requestContext(config), continuation }
    : { context: requestContext(config), browseId: SUBSCRIPTIONS_PAGE_ID };

  const response = await fetch(`${YOUTUBE_ORIGIN}/youtubei/v1/browse?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    credentials: "include",
    headers: requestHeaders(config, sessionSignature),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`YouTube 订阅接口返回 ${response.status}。`);
  }
  return response.json();
};

const readAllSubscriptions = async (): Promise<Channel[]> => {
  const config = getPageConfig();
  const signature = await signedSession(sessionCookie());
  const channelsById = new Map<string, Channel>();
  let nextPage: string | undefined;

  for (let page = 0; page < MAX_REQUESTS; page += 1) {
    const payload = await fetchBrowsePage(config, signature, nextPage);
    for (const channel of collectSessionChannels(payload)) {
      if (!channelsById.has(channel.id)) {
        channelsById.set(channel.id, channel);
      }
    }
    nextPage = pickContinuationToken(payload);
    if (!nextPage) {
      break;
    }
  }

  return Array.from(channelsById.values());
};

pageWindow[CLEANUP_KEY]?.();

const handleRequest = (event: MessageEvent) => {
  if (event.source !== window) {
    return;
  }
  const data = event.data;
  if (!data || data.marker !== MESSAGE_MARK || data.kind !== REQUEST_KIND || typeof data.requestId !== "string") {
    return;
  }

  void readAllSubscriptions()
    .then((channels) => {
      window.postMessage(
        { marker: MESSAGE_MARK, kind: RESPONSE_KIND, requestId: data.requestId, ok: true, channels },
        window.location.origin
      );
    })
    .catch((error: unknown) => {
      window.postMessage(
        {
          marker: MESSAGE_MARK,
          kind: RESPONSE_KIND,
          requestId: data.requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        },
        window.location.origin
      );
    });
};

window.addEventListener("message", handleRequest);
pageWindow[CLEANUP_KEY] = () => {
  window.removeEventListener("message", handleRequest);
};
