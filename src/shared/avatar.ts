const AVATAR_HOSTS = new Set(["yt3.googleusercontent.com", "yt3.ggpht.com"]);

export const AVATAR_HOST_PERMISSIONS = ["https://yt3.googleusercontent.com/*", "https://yt3.ggpht.com/*"] as const;

export function normalizeAvatarUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const absolute = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  try {
    const url = new URL(absolute);
    if (url.protocol === "http:") {
      url.protocol = "https:";
    }
    return url.href;
  } catch {
    return undefined;
  }
}

export function isAllowedAvatarUrl(value: string): boolean {
  const normalized = normalizeAvatarUrl(value);
  if (!normalized) {
    return false;
  }
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" && AVATAR_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
