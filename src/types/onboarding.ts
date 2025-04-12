import { z } from "zod";
import {
  newAccountingFirm,
  newCompany,
  newCompanyInput,
  newUserDirect,
} from "./db.type";

export const onboardingDirectClient = newUserDirect.extend({
  company: newCompanyInput,
  // coa: loadCoaTemplateForCompany,
});
export type OnboardingDirectClient = z.infer<typeof onboardingDirectClient>;

const onboardingAccountingFirm = newUserDirect.extend({
  company: newCompany,
  firm: newAccountingFirm,
});
export type OnboardingAccountingFirm = z.infer<typeof onboardingAccountingFirm>;
