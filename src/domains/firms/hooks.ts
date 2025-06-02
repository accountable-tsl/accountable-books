import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useQuery } from "@tanstack/react-query";
import { checkSlug } from "./api";

export const useSlugCheck = (slug: string, companyId: string) => {
  const debouncedSlug = useDebouncedValue(slug.trim().toLowerCase(), 400);
  const isValid = debouncedSlug.length >= 3;

  return useQuery({
    queryKey: ["slug-check", debouncedSlug, companyId],
    queryFn: () => checkSlug(debouncedSlug, companyId),
    enabled: isValid && !!companyId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    refetchOnWindowFocus: false, // prevent rechecks on tab switch
  });
};
