/**
 * Extract a user-facing message from an unknown error (API response or Error).
 * Use when surfacing errors in toasts or UI.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const data = (error as { response?: { data?: { message?: string } } })
      .response?.data;
    if (typeof data?.message === 'string' && data.message) return data.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * Log error for debugging. In DEV, uses console.error; in production
 * this could be replaced with Sentry.captureException(error) or similar.
 */
export function logError(context: string, error: unknown): void {
  if (import.meta.env.DEV) {
    console.error(`[Journals] ${context}`, error);
  }
}
