import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { useMutation, useQuery } from "@tanstack/react-query";
import { checkSlug, updateSlugFn } from "@/domains/firms/api";
import { queryClient } from "@/lib/queryClient";
import { invalidateFirmCaches, validateSlug } from "@/domains/firms/utils";
import { useCallback } from "react";

export const useSlugCheck = (slug: string, currentSlug?: string) => {
  const debouncedSlug = useDebouncedValue(slug.trim().toLowerCase(), 400);
  const isSameAsCurrent = currentSlug?.trim().toLowerCase() === debouncedSlug;

  const validation = validateSlug(debouncedSlug);
  const shouldCheck =
    validation.isValid && debouncedSlug.length > 0 && !isSameAsCurrent;

  const query = useQuery({
    queryKey: ["firm-slug-check", debouncedSlug],
    queryFn: () => checkSlug(debouncedSlug),
    enabled: shouldCheck,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    retry: (failureCount, error: any) => {
      if (error?.response?.status >= 400 && error?.response?.status < 500) {
        return false;
      }
      return failureCount < 2;
    },
  });

  return {
    ...query,
    validation,
    isSameAsCurrent,
    isChecking: query.isFetching && validation.isValid,
    getError: useCallback(() => {
      // Client-side validation errors first
      if (!validation.isValid) return validation.error;

      if (isSameAsCurrent) return "Your current slug";

      // API errors
      if (query.error) return "Unable to check availability";

      // Availability check
      if (query.data && !query.data.data?.isAvailable) {
        console.log(query.data);
        return "This slug is already taken";
      }

      return null;
    }, [validation, query.error, query.data]),
    isValid: validation.isValid && query.data?.data?.isAvailable === true,
    isEmpty: !debouncedSlug,
  };
};

export const useUpdateFirmSlug = () => {
  return useMutation({
    mutationFn: updateSlugFn,
    onSuccess: () => {
      invalidateFirmCaches(queryClient);
    },
  });
};
