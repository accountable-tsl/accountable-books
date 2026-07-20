import type {
  FetchProjectsParams,
  NewProject,
  ProjectsResponse,
  UpdateProject,
} from '@/modules/projects/model/types';
import type { ApiResponse } from '@/shared/types/core';
import api from '@/lib/axios';

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

export async function updateProjects({
  companyId,
  data,
}: {
  companyId: string;
  data: UpdateProject[];
}) {
  const res = await api.patch(`/api/${companyId}/projects`, data);
  return res.data;
}

export async function deleteProject({
  companyId,
  projectId,
}: {
  companyId: string;
  projectId: string;
}) {
  const res = await api.delete(`/api/${companyId}/projects/${projectId}`);
  return res.data;
}
