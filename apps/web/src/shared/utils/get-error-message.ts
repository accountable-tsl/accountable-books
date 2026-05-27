/** Narrow unknown objects for safe property reads (no casts at call sites). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Extract a user-facing message from an unknown catch value (axios-like API errors or Error).
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (isRecord(error) && 'response' in error) {
    const response = error.response;
    if (isRecord(response) && 'data' in response) {
      const data = response.data;
      if (
        isRecord(data) &&
        typeof data.message === 'string' &&
        data.message.length > 0
      ) {
        return data.message;
      }
    }
  }
  if (error instanceof Error && error.message.length > 0) return error.message;
  return fallback;
}
