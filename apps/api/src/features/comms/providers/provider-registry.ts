import { ENV } from '../../../config/env.js';

import type { CommsChannel } from '../comms.types.js';
import type { CommsProvider } from './provider.types.js';

const providers = new Map<string, CommsProvider>();

function configuredProviderKeyFor(channel: CommsChannel): string | null {
  if (channel === 'email') {
    return ENV.EMAIL_PROVIDER?.trim() || null;
  }

  return ENV[`${channel.toUpperCase()}_PROVIDER`]?.trim() || null;
}

export function registerCommsProvider(provider: CommsProvider): void {
  providers.set(provider.key, provider);
}

export function listCommsProviders(): CommsProvider[] {
  return [...providers.values()];
}

export function getCommsProvider(providerKey: string): CommsProvider {
  const provider = providers.get(providerKey);
  if (!provider) {
    throw new Error(`Comms provider is not registered: ${providerKey}`);
  }
  return provider;
}

export function resolveCommsProvider(channel: CommsChannel): CommsProvider {
  const configuredKey = configuredProviderKeyFor(channel);

  if (!configuredKey) {
    throw new Error(`No comms provider configured for channel ${channel}`);
  }

  const provider = providers.get(configuredKey);
  if (!provider || provider.channel !== channel) {
    throw new Error(
      `Configured comms provider ${configuredKey} is not registered for channel ${channel}`,
    );
  }

  provider.validateConfig();
  return provider;
}

export function resetCommsProvidersForTest(): void {
  if (ENV.NODE_ENV !== 'test') {
    throw new Error('resetCommsProvidersForTest is only available in tests');
  }
  providers.clear();
}
