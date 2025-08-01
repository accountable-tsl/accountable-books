import api from "@/lib/axios";
import { ApiResponse } from "@/shared/types/core";
import { Contacts, NewContact } from "@/features/contacts/contacts-types";

export async function fetchContacts(
  companyId: string
): Promise<ApiResponse<Contacts[]>> {
  const res = await api.get(`/api/${companyId}/contacts`);
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
