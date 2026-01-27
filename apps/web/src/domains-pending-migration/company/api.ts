import type { ApiResponse } from '@/shared/types/core';
import api from '@/lib/axios';

import type { CompanyData, UpdateCompanyVitalsData } from './types';

export const getCompanyDetails = async (
  companyId: string,
): Promise<ApiResponse<CompanyData>> => {
  const response = await api.get(`/api/companies/${companyId}`);
  return response.data;
};

export const updateCompanyDetails = async (
  companyId: string,
  data: Partial<UpdateCompanyVitalsData>,
): Promise<ApiResponse<CompanyData>> => {
  const response = await api.patch(`/api/companies/${companyId}`, data);
  return response.data;
};

export const checkSlugExists = async (
  slug: string,
): Promise<ApiResponse<{ exists: boolean }>> => {
  if (!slug) {
    return {
      success: false,
      message: 'Slug not provided',
      data: { exists: false },
    };
  }
  const response = await api.get<ApiResponse<{ exists: boolean }>>(
    `/api/accounting-firms/check-slug?slug=${encodeURIComponent(slug)}`,
  );
  return response.data;
};
