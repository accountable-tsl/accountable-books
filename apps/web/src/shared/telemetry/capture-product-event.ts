import type {
  ProductEventName,
  ProductEventProperties,
} from '@accountable-books/utils/telemetry/event-catalog';
import { getSessionCorrelationId } from '@/lib/session-correlation';
import { getPostHogEventName } from '@accountable-books/utils/telemetry/event-catalog';
import { scrubForTelemetry } from '@accountable-books/utils/telemetry/scrub';
import posthog from 'posthog-js';

const telemetryEnabled =
  import.meta.env.VITE_TELEMETRY_ENABLED === 'true' &&
  import.meta.env.VITE_POSTHOG_ENABLED === 'true';
const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_POSTHOG_HOST;

let didInitPostHog = false;

function canUseBrowserTelemetry(): boolean {
  return typeof window !== 'undefined';
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as T;
}

function ensurePostHog(): boolean {
  if (!canUseBrowserTelemetry()) return false;
  if (!telemetryEnabled || !posthogKey || !posthogHost) return false;

  if (!didInitPostHog) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
    });
    didInitPostHog = true;
  }

  return true;
}

export type { ProductEventName, ProductEventProperties };

export function captureProductEvent<TEvent extends ProductEventName>(
  event: TEvent,
  properties: ProductEventProperties<TEvent>,
): void {
  if (!ensurePostHog()) return;

  const payload = scrubForTelemetry(
    removeUndefined({
      ...properties,
      correlation_id: properties.correlation_id ?? getSessionCorrelationId(),
    }),
  ) as Record<string, unknown>;

  posthog.capture(getPostHogEventName(event), payload);
}
