import { randomUUID } from 'node:crypto';

import { isDev, isTest } from '../../../config/env.js';

import type { CommsProvider } from './provider.types.js';

function validateDevEmailConfig(): void {
  if (!isDev && !isTest) {
    throw new Error('EMAIL_PROVIDER=dev is only allowed in local/test');
  }
}

export const devEmailProvider: CommsProvider<'email'> = {
  key: 'dev',
  channel: 'email',
  supports: {
    html: true,
    text: true,
  },
  validateConfig: validateDevEmailConfig,
  async send(message) {
    validateDevEmailConfig();
    return {
      providerMessageId: `dev-email:${randomUUID()}`,
      raw: {
        noop: true,
        to: message.to,
        subject: message.subject ?? null,
      },
    };
  },
};
