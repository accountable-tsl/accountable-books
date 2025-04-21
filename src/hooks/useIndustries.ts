import { readCSV } from "@/utils/utils";
import { useQuery } from "@tanstack/react-query";
import csvUrl from "@/data/industries.csv?url";

export type IndustryItem = {
  code: string;
  label: string;
  shortLabel: string;
};

export const useIndustries = () => {
  return useQuery({
    queryKey: ["industries"],
    queryFn: () => readCSV<IndustryItem>(csvUrl),
    staleTime: 1000 * 60 * 60 * 24,
  });
};
