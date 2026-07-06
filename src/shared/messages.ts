import type { Channel, ExtensionState } from "./types";

export const MESSAGE_TYPES = {
  COLLECT_SUBSCRIPTIONS: "YTDLP_COLLECT_SUBSCRIPTIONS",
  OPEN_MANAGER: "YTDLP_OPEN_MANAGER",
  OPEN_CHANNEL: "YTDLP_OPEN_CHANNEL",
  GET_STATE: "YTDLP_GET_STATE",
  STATE_UPDATED: "YTDLP_STATE_UPDATED",
  FETCH_AVATAR: "YTDLP_FETCH_AVATAR"
} as const;

export type CollectSubscriptionsMessage = {
  type: typeof MESSAGE_TYPES.COLLECT_SUBSCRIPTIONS;
};

export type OpenChannelMessage = {
  type: typeof MESSAGE_TYPES.OPEN_CHANNEL;
  url: string;
};

export type OpenManagerMessage = {
  type: typeof MESSAGE_TYPES.OPEN_MANAGER;
};

export type GetStateMessage = {
  type: typeof MESSAGE_TYPES.GET_STATE;
};

export type StateUpdatedMessage = {
  type: typeof MESSAGE_TYPES.STATE_UPDATED;
  state: ExtensionState;
};

export type FetchAvatarMessage = {
  type: typeof MESSAGE_TYPES.FETCH_AVATAR;
  url: string;
};

export type ExtensionMessage =
  | CollectSubscriptionsMessage
  | OpenManagerMessage
  | OpenChannelMessage
  | GetStateMessage
  | StateUpdatedMessage
  | FetchAvatarMessage;

export type CollectSubscriptionsResponse = {
  ok: boolean;
  channels?: Channel[];
  source?: "youtube-session";
  error?: string;
};
