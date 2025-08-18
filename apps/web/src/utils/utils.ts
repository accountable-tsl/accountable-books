import { formatDistanceToNow } from 'date-fns';
import dayjsLib, { type Dayjs } from 'dayjs';
import { toTitleCase, formatAccountText } from '@/shared/utils/formatting-utils';

export function sanitizeInput(value: string): string {
  return value
    .normalize()
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s/g, ' ')
    .trim();
}

export function sanitizeOptionalInput(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const cleaned = sanitizeInput(String(value));
  return cleaned.length ? cleaned : undefined;
}

export async function readCSV<T = Record<string, string>>(url: string): Promise<T[]> {
  const res = await fetch(url);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? '').trim();
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
  return (input as Dayjs).toDate ? (input as Dayjs).toDate() : dayjsLib(input as any).toDate();
}

export function timeAgo(date: Date | number | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return formatDistanceToNow(d, { addSuffix: true });
}

export { toTitleCase, formatAccountText };
