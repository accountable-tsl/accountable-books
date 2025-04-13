export function camelToSnake<T>(input: T): T {
  if (
    !input ||
    input === null ||
    typeof input !== "object" ||
    input instanceof Date
  )
    return input;

  if (Array.isArray(input)) {
    return input.map((item) => camelToSnake(item)) as T;
  }

  return Object.keys(input).reduce(
    (acc, key) => {
      const snakeKey = key
        .replace(/([A-Z]+)/g, "_$1")
        .toLowerCase()
        .replace(/^_/, "");
      acc[snakeKey] = camelToSnake((input as Record<string, any>)[key]);
      return acc;
    },
    {} as Record<string, any>
  ) as T;
}

export function snakeToCamel<T>(input: T): T {
  if (
    !input ||
    input === null ||
    typeof input !== "object" ||
    input instanceof Date
  )
    return input;

  if (Array.isArray(input)) {
    return input.map((item) => snakeToCamel(item)) as T;
  }

  return Object.keys(input).reduce(
    (acc, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, char) =>
        char.toUpperCase()
      );
      acc[camelKey] = snakeToCamel((input as Record<string, any>)[key]);
      return acc;
    },
    {} as Record<string, any>
  ) as T;
}
