import { describe, expect, it, vi } from 'vitest';

import { captureSentryException } from './capture-sentry-exception.js';
import { runWithRequestContext } from './request-context.js';

const { captureException } = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock('@sentry/node', () => ({
  captureException,
}));

describe('captureSentryException', () => {
  it('sends tags only without user or extra', () => {
    runWithRequestContext(
      {
        requestId: 'req-1',
        correlationId: 'corr-1',
        processSource: 'api',
      },
      () => {
        captureSentryException(new Error('boom'), {
          flow: 'signup',
          step: 'register_account',
          errorCode: 'GENERIC',
        });
      },
    );

    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: {
          flow: 'signup',
          step: 'register_account',
          error_code: 'GENERIC',
          correlation_id: 'corr-1',
          request_id: 'req-1',
        },
      }),
    );

    const scope = captureException.mock.calls[0]?.[1];
    expect(scope).not.toHaveProperty('user');
    expect(scope).not.toHaveProperty('extra');
  });

  it('includes optional user and company ids', () => {
    captureSentryException(new Error('fail'), {
      flow: 'signup',
      step: 'post_signup_events',
      userId: 'user-uuid',
      companyId: 'company-uuid',
    });

    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({
          user_id: 'user-uuid',
          company_id: 'company-uuid',
        }),
      }),
    );
  });
});
