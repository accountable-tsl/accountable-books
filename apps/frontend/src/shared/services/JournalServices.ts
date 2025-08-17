import axios from "axios";
import { PostJournalPayload } from "../types/core";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

export const postJournal = async (
  companyId: string,
  data: PostJournalPayload
) => {
  const response = await axios.post(
    `${backendUrl}/api/${companyId}/journals`,
    data
  );
  return response.data;
};

export const fetchJournals = async (companyId: string) => {
  const response = await axios.get(`${backendUrl}/api/${companyId}/journals`);
  return response.data;
};

export const fetchJournalById = async (
  companyId: string,
  journalId: string
) => {
  const response = await axios.get(
    `${backendUrl}/api/${companyId}/journals/${journalId}`
  );
  return response.data;
};

export const updateJournal = async (
  companyId: string,
  data: PostJournalPayload,
  journalId?: string
) => {
  const response = await axios.put(
    `${backendUrl}/api/${companyId}/journals${
      journalId ? `/${journalId}` : "/"
    }`,
    data
  );
  return response.data;
};

export const voidOrDeleteJournal = async (
  companyId: string,
  data: { data: string[] }
) => {
  const response = await axios.patch(
    `${backendUrl}/api/${companyId}/journals/void`,
    data
  );
  return response.data;
};
