import type { Channel } from "../shared/types";

const MESSAGE_MARK = "YTD_LIST_PRO_SESSION_SYNC";
const REQUEST_KIND = "request-subscriptions";
const RESPONSE_KIND = "subscription-result";

type SessionResponse =
  | { ok: true; channels: Channel[] }
  | { ok: false; error: string };

const createRequestId = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function readSubscriptionsFromPageSession(timeoutMs = 30000): Promise<SessionResponse> {
  return new Promise((resolve) => {
    const requestId = createRequestId();
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      resolve({ ok: false, error: "读取 YouTube 登录态超时，请确认当前标签页已打开 YouTube 并已登录。" });
    }, timeoutMs);

    function handleMessage(event: MessageEvent) {
      if (event.source !== window) {
        return;
      }
      const data = event.data;
      if (!data || data.marker !== MESSAGE_MARK || data.kind !== RESPONSE_KIND || data.requestId !== requestId) {
        return;
      }
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
      if (data.ok) {
        resolve({ ok: true, channels: Array.isArray(data.channels) ? data.channels : [] });
      } else {
        resolve({ ok: false, error: String(data.error || "读取 YouTube 订阅失败。") });
      }
    }

    window.addEventListener("message", handleMessage);
    window.postMessage({ marker: MESSAGE_MARK, kind: REQUEST_KIND, requestId }, window.location.origin);
  });
}
