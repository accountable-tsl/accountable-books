import { QueryClient } from '@tanstack/react-query';

import { normalizedReservedSlugs } from './constants';

export const isValidSlug = (slug: string): boolean => {
  const slugRegex = /^(?=[a-z-]{3,20}$)[a-z]+-?[a-z]+$/;
  return slugRegex.test(slug);
};

export const validateSlug = (
  value: string | null | undefined,
  isSlugRequired?: boolean,
): { isValid: boolean; error?: string } => {
  // Skip if not required and empty
  if (!isSlugRequired && !value) return { isValid: true };

  // Required check
  if (!value) return { isValid: false, error: 'Slug is required' };

  // Trim whitespace and check if empty after trimming
  const trimmed = value.trim();
  if (!trimmed) return { isValid: false, error: 'Slug cannot be blank' };

  // Check for leading/trailing hyphens
  if (trimmed.startsWith('-') || trimmed.endsWith('-')) {
    return { isValid: false, error: 'Cannot start or end with a hyphen' };
  }

  // Check for consecutive hyphens
  if (trimmed.includes('--')) {
    return { isValid: false, error: 'Cannot have consecutive hyphens' };
  }

  if (/\d/.test(trimmed)) {
    return { isValid: false, error: 'Must not contain numbers' };
  }
  // Check case (should be lowercase)
  if (trimmed !== trimmed.toLowerCase()) {
    return { isValid: false, error: 'Must be all lowercase letters' };
  }

  if (isReservedSlug(value)) {
    return { isValid: false, error: 'That slug is reserved or unsafe' };
  }

  // Check for invalid characters (anything not alphanumeric or hyphen)
  if (!isValidSlug(trimmed)) {
    return {
      isValid: false,
      error: 'Invalid slug format',
    };
  }

  return { isValid: true };
};

const isReservedSlug = (slug: string): boolean => {
  const normalized = slug
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .trim();

  if (normalizedReservedSlugs.has(normalized)) return true;

  return false;
};

export const invalidateFirmCaches = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: ['firm-slugs'] });
  queryClient.invalidateQueries({
    predicate: (query) => {
      return query.queryKey[0] === 'firm';
    },
  });
};
