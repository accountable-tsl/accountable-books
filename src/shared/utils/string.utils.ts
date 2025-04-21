export const splitIntoWords = (input: string | string[]): string[] => {
  const text = Array.isArray(input) ? input.join(" ") : input;
  const words = text
    .trim()
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word !== "");

  return words;
};
