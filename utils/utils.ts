export function normalizeData(data: { [key: string]: string }): {
  [key: string]: string;
} {
  return Object.keys(data).reduce<{ [key: string]: string }>((acc, key) => {
    acc[key.toLowerCase()] = data[key];
    return acc;
  }, {});
}
