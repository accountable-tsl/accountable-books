export type UserCallbackBlockParams = {
  email: string;
  phone: string;
  timestamp: string;
};

export type AlertBlockParams = {
  title: string;
  message: string;
  timestamp?: string;
};

export type SlackBlockTemplates =
  | { type: 'userCallback'; params: UserCallbackBlockParams }
  | { type: 'alert'; params: AlertBlockParams };

export type SlackMessageInput =
  | { channel?: string; text: string }
  | { channel?: string; block: SlackBlockTemplates };
