import api from "@/lib/axios";
import { ApiResponse } from "@/types/types";

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
