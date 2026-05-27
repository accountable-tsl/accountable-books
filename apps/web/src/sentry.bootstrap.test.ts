import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initSentry, resetSentryInitForTests } from './sentry.bootstrap';

const { init } = vi.hoisted(() => ({
  init: vi.fn(),
}));

vi.mock('@sentry/react', () => ({
  init,
  browserTracingIntegration: vi.fn(() => ({})),
}));

describe('initSentry', () => {
  beforeEach(() => {
    resetSentryInitForTests();
    init.mockClear();
  });

  afterEach(() => {
    resetSentryInitForTests();
  });

  it('does not initialize when DSN is missing', () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    initSentry();
    expect(init).not.toHaveBeenCalled();
  });

  it('initializes once with sendDefaultPii false when DSN is set', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example@o0.ingest.sentry.io/1');
    initSentry();
    initSentry();
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://example@o0.ingest.sentry.io/1',
        sendDefaultPii: false,
      }),
    );
  });

  it('scrubs PII from events in beforeSend', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example@o0.ingest.sentry.io/1');
    initSentry();
    const beforeSend = init.mock.calls[0]?.[0]?.beforeSend as (
      event: Record<string, unknown>,
    ) => Record<string, unknown>;

    const scrubbed = beforeSend({
      user: { email: 'a@b.com', id: 'user-1' },
      extra: { password: 'secret', step: 'signup' },
    });

    expect(scrubbed.user).toEqual({ id: 'user-1' });
    expect(scrubbed.extra).toEqual({
      password: '[REDACTED]',
      step: 'signup',
    });
  });
});
