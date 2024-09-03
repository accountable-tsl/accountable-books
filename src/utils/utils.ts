import { format } from "date-fns";

type DateFormats = "dd-MMM-yyyy" | "dd MMM yyyy" | "dd/MM/yyyy";

export const parseDate = (
  dateString: string,
  returnFormat: string = "dd MMM yyyy"
) => {
  if (!dateString) {
    return null;
  }

  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    return null;
  }

  return format(date, returnFormat);
};
