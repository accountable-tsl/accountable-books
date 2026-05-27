import { beforeEach, describe, expect, it, vi } from 'vitest';

import { captureProductEvent } from './capture-product-event.js';
import { runWithRequestContext } from './request-context.js';

const { capturePostHog } = vi.hoisted(() => ({
  capturePostHog: vi.fn(),
}));

vi.mock('../../config/env.js', () => ({
  NODE_ENV: 'test',
}));

vi.mock('../../lib/posthog.js', () => ({
  capturePostHogEvent: capturePostHog,
}));

describe('captureProductEvent', () => {
  beforeEach(() => {
    capturePostHog.mockClear();
  });

  it('sends signup.completed to PostHog with canonical event name', () => {
    runWithRequestContext(
      {
        requestId: 'req-1',
        correlationId: 'corr-1',
        processSource: 'api',
        userId: 'user-1',
      },
      () => {
        captureProductEvent('signup.completed', {
          company_id: 'company-1',
          company_type: 'business',
          role: 'client',
          user_id: 'user-1',
        });
      },
    );

    expect(capturePostHog).toHaveBeenCalledWith(
      'user-1',
      'signup.completed',
      expect.objectContaining({
        company_id: 'company-1',
        company_type: 'business',
        correlation_id: 'corr-1',
        distinct_id: 'user-1',
        environment: 'test',
        role: 'client',
        user_id: 'user-1',
      }),
    );
  });

  it('sends workspace.created with assigned_firm_id', () => {
    runWithRequestContext(
      {
        requestId: 'req-2',
        correlationId: 'corr-2',
        processSource: 'api',
        userId: 'user-2',
      },
      () => {
        captureProductEvent('workspace.created', {
          assigned_firm_id: 'firm-1',
          company_id: 'company-2',
          company_type: 'business',
          user_id: 'user-2',
        });
      },
    );

    expect(capturePostHog).toHaveBeenCalledWith(
      'user-2',
      'workspace.created',
      expect.objectContaining({
        assigned_firm_id: 'firm-1',
        company_id: 'company-2',
      }),
    );
  });

  it('sends signup.failed with step and error_code', () => {
    runWithRequestContext(
      {
        requestId: 'req-3',
        correlationId: 'corr-3',
        processSource: 'api',
      },
      () => {
        captureProductEvent('signup.failed', {
          error_code: 'billing_failed',
          step: 'provision_workspace',
        });
      },
    );

    expect(capturePostHog).toHaveBeenCalledWith(
      'anonymous',
      'signup.failed',
      expect.objectContaining({
        correlation_id: 'corr-3',
        error_code: 'billing_failed',
        step: 'provision_workspace',
      }),
    );
  });
});
