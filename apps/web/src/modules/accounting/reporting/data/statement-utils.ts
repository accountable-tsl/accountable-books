import type { StatementLine } from '@accountable-books/contracts/schema';

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
