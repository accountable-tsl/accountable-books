import { PostHog } from 'posthog-node';

import { ENV } from '../config/env.js';

let client: PostHog | null = null;

function envFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export function isPostHogEnabled(): boolean {
  return (
    envFlag(ENV.TELEMETRY_ENABLED) &&
    envFlag(ENV.POSTHOG_ENABLED) &&
    Boolean(ENV.POSTHOG_API_KEY)
  );
}

function getPostHogClient(): PostHog | null {
  if (!isPostHogEnabled()) return null;
  if (!client) {
    client = new PostHog(ENV.POSTHOG_API_KEY!, {
      host: ENV.POSTHOG_HOST ?? 'https://eu.i.posthog.com',
    });
  }
  return client;
}

export function capturePostHogEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown>,
): void {
  const posthog = getPostHogClient();
  if (!posthog) return;

  posthog.capture({
    distinctId,
    event,
    properties,
  });
}

export async function shutdownPostHog(): Promise<void> {
  if (!client) return;
  await client.shutdown();
  client = null;
}
