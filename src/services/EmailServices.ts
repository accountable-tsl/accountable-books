import axios from "@/lib/axios";
import { ApiResponse } from "@/types/types";

export type CheckEmailProps = {
  email: string;
  purpose: "signup" | "resetPassword" | "verifyEmail";
};
// Check if email already exists in db
export const checkEmail = async ({
  email,
  purpose = "signup",
}: CheckEmailProps): Promise<ApiResponse<string | null>> => {
  const res = await axios.post(`/api/email/check`, { email, purpose });

  console.log(res);
  return res.data;
};
