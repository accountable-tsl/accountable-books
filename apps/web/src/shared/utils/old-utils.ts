import { formatDistanceToNow } from 'date-fns';
import dayjsLib, { type Dayjs } from 'dayjs';

import {
  formatAccountText,
  toTitleCase,
} from '@/shared/utils/formatting-utils';

export function sanitizeInput(value: string): string {
  return value
    .normalize()
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s/g, ' ')
    .trim();
}

export function sanitizeOptionalInput(
  value: string | null | undefined,
): string | undefined {
  if (value == null) return undefined;
  const cleaned = sanitizeInput(String(value));
  return cleaned.length ? cleaned : undefined;
}

export async function readCSV<T = Record<string, string>>(
  url: string,
): Promise<T[]> {
  const res = await fetch(url);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const parseCSVLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? '';
    });
    return row as T;
  });
}

export function parseDecimal(input: unknown): number {
  if (input == null) return 0;
  try {
    const normalized = String(input).replace(/[,\s]/g, '');
    return parseInt(normalized) || 0;
  } catch {
    return 0;
  }
}

export function normalizeDate(input: Date | Dayjs | string): Date {
  if (input instanceof Date) return input;
  if (typeof input === 'string') return new Date(input);
  // Dayjs
  return (input as Dayjs).toDate
    ? (input as Dayjs).toDate()
    : dayjsLib(input as any).toDate();
}

export function timeAgo(date: Date | number | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return formatDistanceToNow(d, { addSuffix: true });
}

export { formatAccountText, toTitleCase };
