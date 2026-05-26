import * as Sentry from '@sentry/node';

import { getRequestContext } from './request-context.js';

export type CaptureSentryExceptionInput = {
  flow: string;
  step: string;
  errorCode?: string;
  userId?: string;
  companyId?: string;
};

export function captureSentryException(
  error: unknown,
  input: CaptureSentryExceptionInput,
): void {
  const context = getRequestContext();
  const tags: Record<string, string> = {
    flow: input.flow,
    step: input.step,
  };

  if (input.errorCode) {
    tags.error_code = input.errorCode;
  }
  if (input.userId) {
    tags.user_id = input.userId;
  }
  if (input.companyId) {
    tags.company_id = input.companyId;
  }
  if (context?.correlationId) {
    tags.correlation_id = context.correlationId;
  }
  if (context?.requestId) {
    tags.request_id = context.requestId;
  }

  const exception =
    error instanceof Error
      ? error
      : new Error(String(error ?? 'Unknown error'));

  Sentry.captureException(exception, { tags });
}
