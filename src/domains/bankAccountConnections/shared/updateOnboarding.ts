import { knexClient } from "../../../../knexClient";
import { CompanyOnboardingState } from "../../../features/onboarding/onboarding.types";
import { markCompanyOnboardingStepComplete } from "../../../features/onboarding/onboarding.utils";

export const updateBankAccountOnboardingState = async (
  currentState: CompanyOnboardingState,
  companyId: string
) => {
  // get
  const completeStep = markCompanyOnboardingStepComplete(
    currentState,
    "first_bank_account_added"
  );

  // update
  await knexClient("companies")
    .update({ onboarding_state: completeStep })
    .where({ id: companyId });
};
