const SESSION_CORRELATION_KEY = 'ab:session-correlation-id';
let fallbackCorrelationId: string | null = null;

function createCorrelationId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `corr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && !!window.sessionStorage;
}

/**
 * Returns the correlation ID for this browser tab session.
 * Generated once on first call, stored in sessionStorage so it survives
 * in-tab page refreshes but is discarded when the tab closes.
 */
export function getSessionCorrelationId(): string {
  if (!canUseSessionStorage()) {
    fallbackCorrelationId ??= createCorrelationId();
    return fallbackCorrelationId;
  }

  try {
    let id = window.sessionStorage.getItem(SESSION_CORRELATION_KEY);
    if (!id) {
      id = createCorrelationId();
      window.sessionStorage.setItem(SESSION_CORRELATION_KEY, id);
    }
    return id;
  } catch {
    fallbackCorrelationId ??= createCorrelationId();
    return fallbackCorrelationId;
  }
}
