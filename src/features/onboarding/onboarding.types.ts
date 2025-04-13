import { z } from "zod";
import { newUserDirect } from "../../domains/user/user.types";
import {
  companyType,
  newCompanyInput,
} from "../../domains/company/company.types";
import { newAccFirmInput } from "../../domains/accounting-firm/accountingFirm.types";

const onboardingBase = z.object({
  user: newUserDirect,
  company: newCompanyInput.extend({
    load_coa_template: z.boolean().default(true).optional(),
    use_code: z.boolean().default(true),
  }),
  firm: z
    .object({
      id: z.string().uuid(),
    })
    .optional(),
});

export const onboardingDirectClient = onboardingBase.extend({
  company: onboardingBase.shape.company.extend({
    type: companyType.exclude(["accounting_firm"]),
  }),
});
export type OnboardingDirectClient = z.infer<typeof onboardingDirectClient>;

export const onboardingAccFirm = onboardingBase.extend({
  company: onboardingBase.shape.company.extend({
    type: companyType.extract(["accounting_firm"]),
  }),
  firm: newAccFirmInput,
});
export type OnboardingAccFirm = z.infer<typeof onboardingAccFirm>;
