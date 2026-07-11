import { MESSAGE_TYPES, type ExtensionMessage } from "../shared/messages";
import { configureStorageAccount, loadActiveAccountId, loadOrImportInitialState } from "../shared/storage";
import { fetchAvatarDataUrl } from "./avatar-proxy";
import { FEED_CHECK_ALARM_NAME, FEED_CHECK_INTERVAL_MINUTES, runFeedCheck } from "./feed-check";

const isRuntimeAvailable = () => {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
};

const scheduleFeedCheckAlarm = () => {
  if (!chrome.alarms) {
    return;
  }
  chrome.alarms.create(FEED_CHECK_ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: FEED_CHECK_INTERVAL_MINUTES
  });
};

const bootstrap = async () => {
  if (!isRuntimeAvailable()) {
    return;
  }
  await loadOrImportInitialState();
  scheduleFeedCheckAlarm();
};

const isYouTubeUrl = (url: string | undefined): boolean => url?.startsWith("https://www.youtube.com/") === true;

const isMissingContentScript = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /receiving end does not exist|could not establish connection/i.test(message);
};

const injectSubscriptionScripts = async (tabId: number): Promise<void> => {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["assets/page-reader.js"],
    world: "MAIN"
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["assets/content.js"],
    world: "ISOLATED"
  });
};

const sendOpenManagerMessage = async (tabId: number): Promise<void> => {
  try {
    await chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.OPEN_MANAGER });
  } catch (error) {
    if (!isMissingContentScript(error)) {
      throw error;
    }
    await injectSubscriptionScripts(tabId);
    await chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.OPEN_MANAGER });
  }
};

const openManagerWhenTabCompletes = (tabId: number) => {
  const listener = (updatedTabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => {
    if (updatedTabId !== tabId || changeInfo.status !== "complete") {
      return;
    }
    chrome.tabs.onUpdated.removeListener(listener);
    void sendOpenManagerMessage(tabId);
  };
  chrome.tabs.onUpdated.addListener(listener);
};

export async function openManagerInTab(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || !isYouTubeUrl(tab.url)) {
    const createdTab = await chrome.tabs.create({ url: "https://www.youtube.com/" });
    if (createdTab.id) {
      if (createdTab.status === "complete") {
        await sendOpenManagerMessage(createdTab.id);
      } else {
        openManagerWhenTabCompletes(createdTab.id);
      }
    }
    return;
  }

  await sendOpenManagerMessage(tab.id);
}

chrome.runtime.onInstalled.addListener(() => {
  void bootstrap();
});

chrome.runtime.onStartup.addListener(() => {
  void bootstrap();
});

chrome.action.onClicked.addListener((tab) => {
  void openManagerInTab(tab);
});

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === FEED_CHECK_ALARM_NAME) {
    void runFeedCheck();
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.OPEN_CHANNEL) {
    chrome.tabs.create({ url: message.url });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === MESSAGE_TYPES.GET_STATE) {
    // Same account-key trap as feed-check.ts: the background's storage
    // module never learns the active YouTube account on its own, so resync
    // from the persisted account id before touching state.
    void loadActiveAccountId()
      .then((accountId) => configureStorageAccount(accountId))
      .then(() => loadOrImportInitialState())
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === MESSAGE_TYPES.FETCH_AVATAR) {
    void fetchAvatarDataUrl(message.url).then(sendResponse);
    return true;
  }

  return false;
});

void bootstrap();
