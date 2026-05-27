import {
  isReservedFirmSlug as isReservedSlug,
  isValidFirmSlug as isValidSlug,
} from '@accountable-books/utils/firm-slugs';

export { isReservedSlug, isValidSlug };

export const firmSlugRedisKey = (slug: string): string => {
  return `slug:${slug}`;
};
