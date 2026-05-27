import type { StatementLine } from './statement-types';

// ---------------------------------------------------------------------------
// Tree search
// ---------------------------------------------------------------------------

export function findLineById(
  lines: StatementLine[],
  id: string,
  parent?: StatementLine,
): { line: StatementLine; parent?: StatementLine } | null {
  for (const line of lines) {
    if (line.id === id) return { line, parent };
    if (!line.children?.length) continue;

    const nested = findLineById(line.children, id, line);
    if (nested) return nested;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

/**
 * Safely format an ISO date string using `toLocaleDateString`.
 * Falls back to the raw string on invalid input.
 */
export function formatIsoDate(
  iso: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, options);
  } catch {
    return iso;
  }
}
