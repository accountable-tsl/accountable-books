import { v5 as uuidv5 } from 'uuid';

// Basic normalization aligned with contacts model
export const normalizeName = (name: string): string => name.trim().toLowerCase();

// Deterministic, stable UUIDv5 for contacts per (companyId, normalizedName)
export const uuidV5ForCompanyName = (companyId: string, name: string): string => {
  return uuidv5(normalizeName(name), companyId);
};

// Deterministic, stable UUIDv5 for projects per (companyId, normalizedProjectName)
export const uuidV5ForCompanyProject = (companyId: string, projectName: string): string => {
  return uuidv5(normalizeName(projectName), companyId);
};

// Generic array deduper by normalized string key (keeps first occurrence)
export function dedupeByNormalizedKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = normalizeName(getKey(item));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
