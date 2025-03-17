import axios from "axios";
import { PostJournalPayload } from "../types/types";

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
