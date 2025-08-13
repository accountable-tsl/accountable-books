import { z } from "zod";
import { newUserDirect } from "../../domains/users/users.types";
import {
  companyType,
  NewCompany,
  newCompanyInput,
} from "../../domains/companies/companies.types";
import { newAccFirmInput } from "../../domains/accountingFirms/firms.types";
import { SnakeToCamelCaseObject } from "../../shared/utils/formatting.utils";

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
  emailVerified?: boolean; // Added for clarity
};

export type NewCompanyRes = NewCompany & { id: string; slug: string };
export type NewCompanyResCamel = SnakeToCamelCaseObject<NewCompanyRes>;
