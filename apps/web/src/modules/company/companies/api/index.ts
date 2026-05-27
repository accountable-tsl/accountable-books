import type { ApiResponse } from '@/shared/types/core';
import api from '@/lib/axios';

import { companyData } from '../model/types';

import type {
  CompanyData,
  UpdateCompanyData,
  UpdateCompanyVitalsData,
} from '../model/types';

function parseCompanyResponse(
  response: ApiResponse<CompanyData>,
): ApiResponse<CompanyData> {
  if (!response.success || !response.data) return response;

  const parsed = companyData.safeParse(response.data);
  if (!parsed.success) {
    throw new Error('Invalid company response payload');
  }

  return {
    ...response,
    data: parsed.data,
  };
}

function toUpdateCompanyPayload(
  data: Partial<UpdateCompanyVitalsData>,
): Partial<UpdateCompanyData> {
  const { assignedFirmSlug, accountingBasis, defaultTimezone, ...rest } = data;

  delete rest.companyLogo;

  return {
    ...rest,
    ...(accountingBasis !== null ? { accountingBasis } : {}),
    ...(defaultTimezone !== null ? { defaultTimezone } : {}),
    ...(typeof assignedFirmSlug === 'string' ? { slug: assignedFirmSlug } : {}),
  };
}

export const getCompanyDetails = async (
  companyId: string,
): Promise<ApiResponse<CompanyData>> => {
  const response = await api.get(`/api/companies/${companyId}`);
  return parseCompanyResponse(response.data);
};

export const updateCompanyDetails = async (
  companyId: string,
  data: Partial<UpdateCompanyVitalsData>,
): Promise<ApiResponse<CompanyData>> => {
  const response = await api.patch(
    `/api/companies/${companyId}`,
    toUpdateCompanyPayload(data),
  );
  return parseCompanyResponse(response.data);
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
