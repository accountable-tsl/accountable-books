import type { Knex } from 'knex';
import { getCompanyUUID } from '../../../shared/utils/random.utils.js';
import { knexClient } from '../../../db/knexClient.js';
import { getBankAccountsWithDetails } from '../../banking/bankAccounts/bankAccounts.model.js';
import { type BankAccountWithMeta } from '../../banking/bankAccounts/bankAccounts.types.js';
import { type CompanyOnboardingState } from '../../../features/onboarding/onboarding.types.js';

type BankConnectionNeedsAssessment = {
  companyId: string; // resolved UUID
  updateOnboardingState: boolean;
  hasUnmatchedAccounts: boolean;
  unmatchedAccounts?: BankAccountWithMeta[];
  currentOnboardingState?: CompanyOnboardingState;
};

// This function checks retrieves actual companyID
// and checks if company's onboarding status needs updating
// and checks if the company has any dangling bank accounts that needs to be matched at all

/**
 * This function checks the current state of a company's bank accounts and determines:
 * - Whether the company has any dangling bank accounts that needs to be matched at all
 * - Whether the company's onboarding status needs updating
 * - Whether the company has any accounts that needs to be matched
 * - The list of unmatched accounts
 * @param {string} companyId - The company id or identifier
 * @param {Knex.Transaction} trx - The knex transaction to use
 * @return {Promise<BankConnectionNeedsAssessment>}
 */
export const getBankConnectionNeeds = async ({
  companyId: receivedCompanyId,
  trx,
}: {
  companyId: string;
  trx: Knex.Transaction;
}): Promise<BankConnectionNeedsAssessment> => {
  const companyUUID = await getCompanyUUID(receivedCompanyId, trx);
  if (!companyUUID) throw new Error('Invalid company identifier');

  const { data: bankAccounts } = await getBankAccountsWithDetails(companyUUID, trx);

  const company = await trx('companies')
    .select('onboarding_state')
    .where({ id: companyUUID })
    .first();

  // Determine unmatched accounts
  const hasUnmatchedAccounts = bankAccounts?.some((account) => !account.bankConnectionId) ?? false;

  const updateOnboardingState = company?.onboarding_state?.steps.first_bank_account_added ?? true;

  const unmatchedAccounts = bankAccounts?.filter((account) => !account.bankConnectionId);

  return {
    companyId: companyUUID,
    updateOnboardingState,
    currentOnboardingState: company?.onboarding_state,
    hasUnmatchedAccounts,
    unmatchedAccounts,
  };
};
