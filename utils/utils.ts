/**
 * Convert object keys to lowercase.
 * @param {Object} data - Object with string keys.
 * @returns {Object} New object with lowercase keys.
 */
export function normalizeData(data: { [key: string]: string }): {
  [key: string]: string;
} {
  return Object.keys(data).reduce<{ [key: string]: string }>((acc, key) => {
    acc[key.toLowerCase()] = data[key];
    return acc;
  }, {});
}

/**
 * Detect input format: JSON or CSV.
 * Expected input is JSON from req.body or CSV file uploaded
 * @param {any} input - File or string input.
 * @returns {string} 'csv', 'json', or 'unknown'.
 */
export function simpleInputFormatDetect(input: any): string {
  const inputType =
    input instanceof File
      ? "file"
      : typeof input === "string"
      ? "string"
      : "unknown";

  if (
    inputType === "file" &&
    (input.name.toLowerCase().endsWith(".csv") || input.type === "text/csv")
  ) {
    return "csv";
  } else {
    try {
      JSON.parse(input);
      return "json";
    } catch (error) {}
    return "unknown";
  }
}

/**
 * Convert a string to title case.
 * @param {string} text - Input string.
 * @returns {string} Title-cased string.
 */
export function toTitleCase(text: string) {
  return text.replace(/\w\S*/g, (txt) =>
    txt === txt.toUpperCase()
      ? txt
      : txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
  );
}

/**
 * Truncate text to a specified length and add ellipsis.
 * @param {string} input - The text to truncate.
 * @param {number} maxLength - Maximum length of the text.
 * @returns {string} Truncated text with ellipsis.
 */
export function truncateText(input: string, maxLength: number) {
  return input.length > maxLength ? input.slice(0, maxLength) + "..." : input;
}
