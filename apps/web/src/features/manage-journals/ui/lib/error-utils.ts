export { getErrorMessage } from '@/shared/utils/get-error-message';

/**
 * Log error for debugging. In DEV, uses console.error; in production
 * this could be replaced with Sentry.captureException(error) or similar.
 */
export function logError(context: string, error: unknown): void {
  if (import.meta.env.DEV) {
    console.error(`[Journals] ${context}`, error);
  }
}
