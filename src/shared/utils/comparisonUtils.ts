export interface ComparisonResult {
  added: Record<string | number, any>;
  modified: Record<string | number, any>;
  removed: Record<string | number, any>;
  summary: {
    hasChanges: boolean;
    addedCount: number;
    modifiedCount: number;
    removedCount: number;
  };
}

export function compareDeep(A: any, B: any): ComparisonResult {
  const result: ComparisonResult = {
    added: {},
    modified: {},
    removed: {},
    summary: {
      hasChanges: false,
      addedCount: 0,
      modifiedCount: 0,
      removedCount: 0,
    },
  };

  // Handle primitive comparisons
  if (!isObject(A) && !isObject(B)) {
    if (A !== B) {
      result.modified["value"] = B;
      result.summary.hasChanges = true;
      result.summary.modifiedCount = 1;
    }
    return result;
  }

  // Handle array comparisons
  if (Array.isArray(A) && Array.isArray(B)) {
    return compareArrays(A, B, result);
  }

  // Handle object comparisons
  if (isObject(A) && isObject(B)) {
    return compareObjects(A, B, result);
  }

  // Handle mixed types
  if (A !== B) {
    result.modified["value"] = B;
    result.summary.hasChanges = true;
    result.summary.modifiedCount = 1;
  }

  return result;
}

export function isObject(value: any): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareObjects(
  A: any,
  B: any,
  result: ComparisonResult
): ComparisonResult {
  const allKeys = new Set([...Object.keys(A), ...Object.keys(B)]);

  allKeys.forEach((key) => {
    const aValue = A[key];
    const bValue = B[key];

    if (!(key in A)) {
      result.added[key] = bValue;
      result.summary.addedCount++;
      result.summary.hasChanges = true;
    } else if (!(key in B)) {
      result.removed[key] = aValue;
      result.summary.removedCount++;
      result.summary.hasChanges = true;
    } else if (aValue !== bValue) {
      if (
        isObject(aValue) ||
        isObject(bValue) ||
        Array.isArray(aValue) ||
        Array.isArray(bValue)
      ) {
        const nestedResult = compareDeep(aValue, bValue);
        if (nestedResult.summary.hasChanges) {
          result.modified[key] = nestedResult;
          result.summary.modifiedCount++;
          result.summary.hasChanges = true;
        }
      } else if (aValue !== bValue) {
        result.modified[key] = bValue;
        result.summary.modifiedCount++;
        result.summary.hasChanges = true;
      }
    }
  });

  return result;
}

function compareArrays(
  A: any[],
  B: any[],
  result: ComparisonResult
): ComparisonResult {
  const maxLength = Math.max(A.length, B.length);

  for (let i = 0; i < maxLength; i++) {
    const aValue = A[i];
    const bValue = B[i];

    if (i >= A.length) {
      result.added[i] = bValue;
      result.summary.addedCount++;
      result.summary.hasChanges = true;
    } else if (i >= B.length) {
      result.removed[i] = aValue;
      result.summary.removedCount++;
      result.summary.hasChanges = true;
    } else if (aValue !== bValue) {
      if (
        isObject(aValue) ||
        isObject(bValue) ||
        Array.isArray(aValue) ||
        Array.isArray(bValue)
      ) {
        const nestedResult = compareDeep(aValue, bValue);
        if (nestedResult.summary.hasChanges) {
          result.modified[i] = nestedResult;
          result.summary.modifiedCount++;
          result.summary.hasChanges = true;
        }
      } else if (aValue !== bValue) {
        result.modified[i] = bValue;
        result.summary.modifiedCount++;
        result.summary.hasChanges = true;
      }
    }
  }

  return result;
}

export function getChangesOnly(A: any, B: any): Record<string, any> {
  const comparison = compareDeep(A, B);
  return { ...comparison.added, ...comparison.modified };
}

export function getChangedValues(A: any, B: any): Record<string, any> {
  const comparison = compareDeep(A, B);
  const result: Record<string, any> = {};

  function flatten(obj: any, prefix = "") {
    Object.keys(obj).forEach((key) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (isObject(obj[key]) && !("added" in obj[key])) {
        flatten(obj[key], fullKey);
      } else {
        result[fullKey] = obj[key];
      }
    });
  }

  flatten(comparison.added);
  flatten(comparison.modified);

  return result;
}
