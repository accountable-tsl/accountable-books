import { z } from 'zod';

import {
  type NewCompany,
  newCompanyInput,
} from '../../domains/companies/companies.types.js';
import { newUserDirect } from '../../domains/users/users.types.js';
import { type SnakeToCamelCaseObject } from '../../shared/utils/formatting.utils.js';

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
