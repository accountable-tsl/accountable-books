import { z } from "zod";
import { dbBaseFields } from "../../core/validation/schemas";

export const newUserCompanyRole = z.object({
  user_id: z.string().uuid(),
  company_id: z.string().uuid(),
  role_id: z.string().uuid(),
});
export const userCompanyRole = newUserCompanyRole.merge(dbBaseFields);

export type NewUserCompanyRole = z.infer<typeof newUserCompanyRole>;
export type UserCompanyRole = z.infer<typeof userCompanyRole>;
