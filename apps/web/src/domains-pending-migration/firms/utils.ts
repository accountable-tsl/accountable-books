import {
  isReservedFirmSlug,
  isValidFirmSlug,
} from '@accountable-books/utils/firm-slugs';
import { QueryClient } from '@tanstack/react-query';

export const isValidSlug = isValidFirmSlug;

export const validateSlug = (
  value: string | null | undefined,
  isSlugRequired?: boolean,
): { isValid: boolean; error?: string } => {
  if (!isSlugRequired && !value) return { isValid: true };

  if (!value) return { isValid: false, error: 'Slug is required' };

  const trimmed = value.trim();
  if (!trimmed) return { isValid: false, error: 'Slug cannot be blank' };

  if (trimmed.startsWith('-') || trimmed.endsWith('-')) {
    return { isValid: false, error: 'Cannot start or end with a hyphen' };
  }

  if (trimmed.includes('--')) {
    return { isValid: false, error: 'Cannot have consecutive hyphens' };
  }

  if (/\d/.test(trimmed)) {
    return { isValid: false, error: 'Must not contain numbers' };
  }

  if (trimmed !== trimmed.toLowerCase()) {
    return { isValid: false, error: 'Must be all lowercase letters' };
  }

  if (isReservedFirmSlug(value)) {
    return { isValid: false, error: 'That slug is reserved or unsafe' };
  }

  if (!isValidFirmSlug(trimmed)) {
    return {
      isValid: false,
      error: 'Invalid slug format',
    };
  }

  return { isValid: true };
};

export const invalidateFirmCaches = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: ['firm-slugs'] });
  queryClient.invalidateQueries({
    predicate: (query) => {
      return query.queryKey[0] === 'firm';
    },
  });
};
