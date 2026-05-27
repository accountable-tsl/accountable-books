import type {
  ProductEventName,
  ProductEventProperties,
} from '@accountable-books/utils/telemetry/event-catalog';
import {
  getPostHogEventName,
  PRODUCT_EVENT_CATALOG,
} from '@accountable-books/utils/telemetry/event-catalog';
import { scrubForTelemetry } from '@accountable-books/utils/telemetry/scrub';

import { NODE_ENV } from '../../config/env.js';
import { capturePostHogEvent } from '../../lib/posthog.js';
import { getRequestContext } from './request-context.js';

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as T;
}

function resolveDistinctId(
  properties: Record<string, unknown>,
  fallbackId?: string,
): string {
  const userId = properties.user_id;
  if (typeof userId === 'string' && userId.length > 0) {
    return userId;
  }

  if (fallbackId && fallbackId.length > 0) {
    return fallbackId;
  }

  return 'anonymous';
}

export type { ProductEventName, ProductEventProperties };

export function captureProductEvent<TEvent extends ProductEventName>(
  event: TEvent,
  properties: ProductEventProperties<TEvent>,
): void {
  if (!(event in PRODUCT_EVENT_CATALOG)) return;

  const context = getRequestContext();
  const sanitizedProperties = scrubForTelemetry(
    removeUndefined({
      ...properties,
      correlation_id: context?.correlationId,
    }),
  ) as Record<string, unknown>;

  const distinctId = resolveDistinctId(sanitizedProperties, context?.userId);
  const payload = {
    distinct_id: distinctId,
    environment: NODE_ENV,
    ...sanitizedProperties,
  };

  capturePostHogEvent(distinctId, getPostHogEventName(event), payload);
}
