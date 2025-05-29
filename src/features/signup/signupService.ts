import axios from "@/lib/axios";
import { ServerResponseFormat } from "@/types/types";
import { NewCompany, NewFirm, NewUser } from "./signupTypes";

export const submitSignup = async (data: {
  user: NewUser;
  company: NewCompany;
  firm?: NewFirm;
}): Promise<ServerResponseFormat<any>> => {
  const res = await axios.post("/api/signup", { data });
  return res.data;
};
