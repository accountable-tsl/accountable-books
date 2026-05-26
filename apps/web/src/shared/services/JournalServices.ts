import api from '@/lib/axios';

import type { PostJournalPayload } from '../types/core';

export const postJournal = async (
  companyId: string,
  data: PostJournalPayload,
) => {
  const response = await api.post(`/api/${companyId}/journals`, data);
  return response.data;
};

export const fetchJournals = async (companyId: string) => {
  const response = await api.get(`/api/${companyId}/journals`);
  return response.data;
};

export const fetchJournalById = async (
  companyId: string,
  journalId: string,
) => {
  const response = await api.get(`/api/${companyId}/journals/${journalId}`);
  return response.data;
};

export const updateJournal = async (
  companyId: string,
  data: PostJournalPayload,
  journalId?: string,
) => {
  const response = await api.put(
    `/api/${companyId}/journals${journalId ? `/${journalId}` : '/'}`,
    data,
  );
  return response.data;
};

export const voidOrDeleteJournal = async (
  companyId: string,
  data: { data: string[] },
) => {
  const response = await api.patch(`/api/${companyId}/journals/void`, data);
  return response.data;
};
