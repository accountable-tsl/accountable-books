import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { useMutation, useQuery } from "@tanstack/react-query";
import { checkSlug, fetchFirmSlugs, updateSlugFn } from "@/domains/firms/api";
import { queryClient } from "@/lib/queryClient";
import { invalidateFirmCaches } from "./utils";

export const useSlugCheck = (slug: string, companyId: string) => {
  const debouncedSlug = useDebouncedValue(slug.trim().toLowerCase(), 400);
  const isValid = debouncedSlug.length >= 3;

  return useQuery({
    queryKey: ["firm-slug-check", debouncedSlug, companyId],
    queryFn: () => checkSlug(debouncedSlug, companyId),
    enabled: isValid && !!companyId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    refetchOnWindowFocus: false, // prevent rechecks on tab switch
  });
};

export const useFirmSlugs = () => {
  return useQuery({
    queryKey: ["firm-slugs"],
    queryFn: fetchFirmSlugs,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 6, // 6 hours
    refetchOnWindowFocus: false,
  });
};

export const useUpdateFirmSlug = () => {
  return useMutation({
    mutationFn: updateSlugFn,
    onSuccess: () => {
      invalidateFirmCaches(queryClient);
    },
  });
};
