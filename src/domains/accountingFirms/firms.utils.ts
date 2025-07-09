import { normalizedReservedSlugs } from "./firms.constants";

export const isValidSlug = (slug: string): boolean => {
  const slugRegex = /^(?=[a-z-]{3,20}$)[a-z]+(-[a-z]+)*$/;
  return slugRegex.test(slug);
};

export const firmSlugRedisKey = (slug: string): string => {
  return `slug:${slug}`;
};

export const isReservedSlug = (slug: string): boolean => {
  const normalized = slug
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .trim();

  if (normalizedReservedSlugs.has(normalized)) return true;

  return false;
};
