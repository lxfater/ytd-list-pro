import { isAllowedAvatarUrl, normalizeAvatarUrl } from "../shared/avatar";

const MAX_AVATAR_BYTES = 1024 * 1024;

export type FetchAvatarDataUrlResult =
  | {
      ok: true;
      dataUrl: string;
    }
  | {
      ok: false;
      error: string;
    };

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
};

export async function fetchAvatarDataUrl(value: string): Promise<FetchAvatarDataUrlResult> {
  const url = normalizeAvatarUrl(value);
  if (!url || !isAllowedAvatarUrl(url)) {
    return { ok: false, error: "Unsupported avatar URL" };
  }

  try {
    const response = await fetch(url, {
      credentials: "omit",
      referrerPolicy: "no-referrer"
    });
    if (!response.ok) {
      return { ok: false, error: `Avatar request failed: ${response.status}` };
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return { ok: false, error: "Avatar response was not an image" };
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_AVATAR_BYTES) {
      return { ok: false, error: "Avatar image was too large" };
    }

    return { ok: true, dataUrl: `data:${contentType};base64,${bytesToBase64(bytes)}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
