import {
  NORMALIZED_RESERVED_SLUGS,
  RESERVED_SLUG_PREFIXES,
} from './constants.js';

const FIRM_SLUG_REGEX = /^(?=[a-z-]{3,20}$)[a-z]+(-[a-z]+)*$/;

export function normalizeFirmSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

export function isValidFirmSlug(slug: string): boolean {
  return FIRM_SLUG_REGEX.test(slug);
}

function matchesReservedPrefix(normalized: string): boolean {
  return RESERVED_SLUG_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(prefix),
  );
}

export function isReservedFirmSlug(slug: string): boolean {
  const normalized = normalizeFirmSlug(slug);
  if (!normalized) return false;

  if (NORMALIZED_RESERVED_SLUGS.has(normalized)) return true;
  if (matchesReservedPrefix(normalized)) return true;

  return false;
}
