export function sortProviders<T extends Record<string, any>>(
  providers: T[],
  opts?: {
    firstKey?: string;
    lastKey?: string;
    limit?: number;
    prioritizeBy?: {
      property: keyof T;
      values: any[];
    };
    fallbackSort?: (a: T, b: T) => number;
  }
): T[] {
  const { firstKey, lastKey, limit, prioritizeBy, fallbackSort } = opts || {};
  let arr = [...providers];

  arr.sort((a, b) => {
    // Handle specific key prioritization (existing logic)
    if (firstKey && "key" in a && "key" in b) {
      if (a.key === firstKey) return -1;
      if (b.key === firstKey) return 1;
    }
    if (lastKey && "key" in a && "key" in b) {
      if (a.key === lastKey) return 1;
      if (b.key === lastKey) return -1;
    }

    // Handle property-based prioritization
    if (prioritizeBy) {
      const { property, values } = prioritizeBy;
      const aIndex = values.indexOf(a[property]);
      const bIndex = values.indexOf(b[property]);

      // If both items have prioritized values, sort by their order in the values array
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      // If only one item has a prioritized value, it comes first
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
    }

    // Fallback to custom sort function or priority-based sorting
    if (fallbackSort) {
      return fallbackSort(a, b);
    }

    // Default priority-based sorting (if priority property exists)
    if (
      "priority" in a &&
      "priority" in b &&
      typeof a.priority === "number" &&
      typeof b.priority === "number"
    ) {
      return a.priority - b.priority;
    }

    return 0;
  });

  if (limit) return arr.slice(0, limit);
  return arr;
}
