import api from '@/lib/axios';
import type {
  FetchProjectsParams,
  NewProject,
  ProjectsResponse,
} from '@/modules/projects/model/types';
import type { ApiResponse } from '@/shared/types/core';

export async function fetchProjects(
  input: FetchProjectsParams,
): Promise<ApiResponse<ProjectsResponse>> {
  const { companyId, ...filters } = input;
  const res = await api.post(`/api/${companyId}/projects/query`, filters);
  return res.data;
}

export async function addNewProjects({
  companyId,
  data,
}: {
  companyId: string;
  data: NewProject[];
}) {
  const res = await api.post(`/api/${companyId}/projects`, data);
  return res.data;
}
