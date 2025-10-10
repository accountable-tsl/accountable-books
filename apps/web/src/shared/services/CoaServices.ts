import axios from 'axios';

const backendUrl = import.meta.env.VITE_BACKEND_URL;

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
  const response = await axios.get(`${backendUrl}/api/${companyId}/coa`, {
    params: { page, limit, sortBy, sortOrder },
  });
  return response.data;
};
