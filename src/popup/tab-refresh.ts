type ScriptExecutor = Pick<typeof chrome.scripting, "executeScript">;

const missingContentPatterns = [
  /receiving end does not exist/i,
  /could not establish connection/i,
  /no tab with id/i
];

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
};

export function isMissingContentScript(error: unknown): boolean {
  const message = errorMessage(error);
  return missingContentPatterns.some((pattern) => pattern.test(message));
}

export async function injectSubscriptionScripts(
  tabId: number,
  scripting: ScriptExecutor = chrome.scripting
): Promise<void> {
  await scripting.executeScript({
    target: { tabId },
    files: ["assets/page-reader.js"],
    world: "MAIN"
  });
  await scripting.executeScript({
    target: { tabId },
    files: ["assets/content.js"],
    world: "ISOLATED"
  });
}
