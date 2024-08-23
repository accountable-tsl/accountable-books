export function normalizeData(data: { [key: string]: string }): {
  [key: string]: string;
} {
  return Object.keys(data).reduce<{ [key: string]: string }>((acc, key) => {
    acc[key.toLowerCase()] = data[key];
    return acc;
  }, {});
}

//Detect simple json input/ csv upload format
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

export function toTitleCase(text: string) {
  return text.replace(/\w\S*/g, (txt) =>
    txt === txt.toUpperCase()
      ? txt
      : txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
  );
}
