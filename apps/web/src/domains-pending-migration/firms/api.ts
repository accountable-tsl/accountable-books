import type { ApiResponse } from '@/shared/types/core';
import api from '@/lib/axios';
import { AxiosError } from 'axios';

export const checkSlug = async (
  slug: string,
): Promise<ApiResponse<{ isAvailable: boolean }>> => {
  try {
    const response = await api.get(
      `/api/accounting-firms/check-slug?slug=${encodeURIComponent(slug)}`,
    );
    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response?.data) {
      return error.response.data;
    }

    return {
      success: false,
      message: 'Unable to check slug availability. Please try again.',
      data: { isAvailable: false },
    };
  }
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
