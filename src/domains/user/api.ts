import api from "@/lib/axios";
import { ServerResponseFormat } from "@/types/types";
import { UserData } from "./types";

export const getUserDetails = async (
  userId: string
): Promise<ServerResponseFormat<UserData>> => {
  const response = await api.get(`/api/users/${userId}`);
  return response.data;
};
