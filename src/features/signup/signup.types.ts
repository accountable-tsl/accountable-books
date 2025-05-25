import { z } from "zod";
import { newUserDirect, UserStatus } from "../../domains/users/users.types";
import {
  companyType,
  newCompanyInput,
} from "../../domains/companies/companies.types";
import { newAccFirmInput } from "../../domains/accountingFirm/accountingFirm.types";

export const newSignup = z.object({
  user: newUserDirect,
  company: newCompanyInput,
});

// export const clientSignup = onboardingBase.extend({
//   company: onboardingBase.shape.company.extend({
//     type: companyType,
//   }),
// });
// export type ClientSignup = z.infer<typeof clientSignup>;

// export const firmSignup = onboardingBase.extend({
//   company: onboardingBase.shape.company.extend({
//     type: companyType.extract(["accounting_firm"]),
//   }),
//   firm: newAccFirmInput,
// });
// export type FirmSignup = z.infer<typeof firmSignup>;
export type CreateUserDirectResponse = {
  id: string;
  firstname: string;
  lastname: string | null;
  email: string;
  status: UserStatus;
  verificationToken: string; // Non-null for initial response
  emailVerified?: boolean; // Added for clarity
};
