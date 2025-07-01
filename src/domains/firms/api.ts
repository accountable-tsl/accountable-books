import api from "@/lib/axios";
import { ApiResponse } from "@/shared/types/core";

export const checkSlug = async (
  slug: string,
  companyId: string
): Promise<ApiResponse<{ isAvailable: boolean; isCurrent?: boolean }>> => {
  const response = await api.get(
    `/api/accounting-firms/check-slug?slug=${encodeURIComponent(
      slug
    )}&companyId=${encodeURIComponent(companyId)}`
  );
  return response.data;
};

export const fetchFirmSlugs = async (): Promise<ApiResponse<string[]>> => {
  const response = await api.get(`/api/accounting-firms/slugs`);
  return response.data;
};

export const updateSlugFn = async ({
  firmId,
  slug,
}: {
  firmId: string;
  slug: string;
}): Promise<void> => {
  await api.patch(`/api/accounting-firms/${firmId}/slug`, { slug });
};
