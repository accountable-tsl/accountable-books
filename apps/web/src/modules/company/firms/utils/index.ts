export const normalizedReservedSlugs = new Set(
  rawReservedSlugs.map((s) =>
    s
      .toLowerCase()
      .replace(/[_\s]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .trim(),
  ),
);
