import api from '@/lib/axios';
import type { ApiResponse } from '@/shared/types/core';
import type {
  ContactResponse,
  GetContactsParams,
  NewContact,
} from '@/features/contacts/contacts-types';

export async function fetchContacts(
  input: GetContactsParams,
): Promise<ApiResponse<ContactResponse>> {
  const { companyId, ...filters } = input;
  const res = await api.post(`/api/${companyId}/contacts/query`, filters);
  return res.data;
}

export async function addNewContacts({
  companyId,
  data,
}: {
  companyId: string;
  data: NewContact[];
}) {
  const res = await api.post(`/api/${companyId}/contacts`, data);
  return res.data;
}
