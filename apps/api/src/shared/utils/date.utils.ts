export function toDateString(
  input: string | Date,
  format: 'yyyy-mm-dd' | 'dd/mm/yyyy' | 'mm/dd/yyyy' = 'yyyy-mm-dd',
): string | null {
  let date: Date;

  if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'string') {
    date = new Date(input);
    if (isNaN(date.getTime())) return null; // Invalid date
  } else {
    return null;
  }

  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());

  switch (format) {
    case 'dd/mm/yyyy':
      return `${day}/${month}/${year}`;
    case 'mm/dd/yyyy':
      return `${month}/${day}/${year}`;
    case 'yyyy-mm-dd':
    default:
      return `${year}-${month}-${day}`;
  }
}
