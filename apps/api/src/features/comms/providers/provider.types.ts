import type { CommsChannel } from '../comms.types.js';

export interface RenderedCommsMessage<C extends CommsChannel = CommsChannel> {
  channel: C;
  to: string;
  subject?: string;
  html?: string;
  text?: string;
}

export interface CommsProvider<C extends CommsChannel = CommsChannel> {
  key: string;
  channel: C;
  supports: {
    html?: boolean;
    text?: boolean;
    attachments?: boolean;
  };
  validateConfig(): void;
  send(message: RenderedCommsMessage<C>): Promise<{
    providerMessageId?: string;
    raw?: unknown;
  }>;
}
