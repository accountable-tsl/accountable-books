import api from '@/lib/axios';

type FetchCoaParams = {
  companyId: string | number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

export const fetchCoa = async ({
  companyId,
  page,
  limit,
  sortBy,
  sortOrder,
}: FetchCoaParams) => {
  const response = await api.get(`/api/${companyId}/coa`, {
    params: { page, limit, sortBy, sortOrder },
  });
  return response.data;
};
