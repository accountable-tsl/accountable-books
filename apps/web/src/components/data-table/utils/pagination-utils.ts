import type { PaginationOptions } from '@/components/data-table/types/data-table';

interface PageSizeOptionsParams {
  options?: PaginationOptions;
  totalRows?: number; // total rows in the dataset
  maxAllowedSize?: number; // optional cap to prevent huge page sizes
  allowShowAll?: boolean; // whether to show the "All" option
}

/**
 * Generates page size options for pagination controls.
 *
 * This function creates a list of page size options that can be used in pagination
 * dropdowns. It handles various scenarios including custom options, initial page sizes,
 * and the "show all" functionality.
 *
 * @param params - Configuration parameters for generating page size options
 * @param params.options - Pagination options from the table configuration
 * @param params.totalRows - Total number of rows in the dataset (used for validation and "all" option)
 * @param params.maxAllowedSize - Maximum allowed page size (defaults to 500)
 * @param params.allowShowAll - Whether to include the "all" option (defaults to true)
 *
 * @returns Array of page size options, where each option is either a number or "all"
 *
 * @example
 * ```typescript
 * const options = getPageSizeOptions({
 *   options: { initialPageSize: 25 },
 *   totalRows: 1000,
 *   allowShowAll: true
 * });
 * // Returns: [25, 50, 75, 100, "all"]
 * ```
 */
export function getPageSizeOptions({
  options,
  totalRows,
  maxAllowedSize = 500,
  allowShowAll = true,
}: PageSizeOptionsParams): (number | 'all')[] {
  const { pageSizeOptions, initialPageSize } = options || {};

  // Default page size options for when no custom configuration is provided
  const defaultOptions = [10, 20, 25, 30, 40, 50];

  // If no custom options provided, use defaults
  if (!pageSizeOptions?.length && !initialPageSize) {
    const validDefaults = defaultOptions.filter(
      (size) =>
        size > 0 &&
        (typeof totalRows === 'number' ? size <= totalRows : true) &&
        size <= maxAllowedSize,
    );

    return allowShowAll ? [...validDefaults, 'all'] : validDefaults;
  }

  // If custom page size options provided, validate and filter them
  if (pageSizeOptions?.length) {
    const validSizes = pageSizeOptions
      .filter(
        (size): size is number =>
          typeof size === 'number' &&
          size > 0 &&
          !isNaN(size) &&
          isFinite(size),
      )
      .filter((size) => {
        // Validate against total rows if provided
        if (typeof totalRows === 'number' && totalRows > 0) {
          if (size > totalRows) return false;
        }

        // Validate against maximum allowed size
        if (typeof maxAllowedSize === 'number' && maxAllowedSize > 0) {
          if (size > maxAllowedSize) return false;
        }

        return true;
      })
      .sort((a, b) => a - b);

    // Ensure we have at least one valid option
    if (validSizes.length === 0) {
      const fallbackOptions = defaultOptions.filter(
        (size) => size <= (maxAllowedSize || 500),
      );
      return allowShowAll ? [...fallbackOptions, 'all'] : fallbackOptions;
    }

    return allowShowAll ? [...validSizes, 'all'] : validSizes;
  }

  // Generate options based on initialPageSize
  const base = initialPageSize ?? 10;

  // Validate the base value
  if (typeof base !== 'number' || base <= 0 || isNaN(base) || !isFinite(base)) {
    const fallbackOptions = defaultOptions.filter(
      (size) => size <= (maxAllowedSize || 500),
    );
    return allowShowAll ? [...fallbackOptions, 'all'] : fallbackOptions;
  }

  const sizes: number[] = [];

  // For smaller initialPageSize, create options by multiplying
  if (base < 50) {
    sizes.push(base, base * 2, base * 3, base * 4);
  } else {
    // For larger initialPageSize, create options around the base value
    sizes.push(base - 50, base, base + 50);
  }

  // Remove duplicates and filter out invalid sizes
  const validSizes = Array.from(new Set(sizes))
    .filter((size) => {
      // Basic validation
      if (size <= 0 || isNaN(size) || !isFinite(size)) return false;

      // Validate against total rows if provided
      if (typeof totalRows === 'number' && totalRows > 0) {
        if (size > totalRows) return false;
      }

      // Validate against maximum allowed size
      if (typeof maxAllowedSize === 'number' && maxAllowedSize > 0) {
        if (size > maxAllowedSize) return false;
      }

      return true;
    })
    .sort((a, b) => a - b);

  // Ensure we have at least one valid option
  if (validSizes.length === 0) {
    const fallbackOptions = defaultOptions.filter(
      (size) => size <= (maxAllowedSize || 500),
    );
    return allowShowAll ? [...fallbackOptions, 'all'] : fallbackOptions;
  }

  return allowShowAll ? [...validSizes, 'all'] : validSizes;
}
