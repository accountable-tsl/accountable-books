import type { Knex } from 'knex';
import { errorResponse, successResponse } from '../../shared/utils/response.utils.js';
import { ENV } from '../../config/env.js';
import { knexClient } from '../../db/knexClient.js';
import { type ApiResponse } from '../../core/types/api.types.js';
import {
  bankAccountConnectionInputCamel,
  type ConnectionResponse,
  type CreateNewBankAccountConnection,
} from './baccons.types.js';
import { getBankConnectionNeeds } from './shared/prerequisites.js';
import { exchangeMonoCode } from './mono/exchangeCode.js';
import { getMonoAccountDetails } from './mono/getAccountDetails.js';
import { getProvider } from './shared/getProvider.js';
import { checkForDuplicate } from './shared/checkDuplicate.js';
import { updateBankAccountOnboardingState } from './shared/updateOnboarding.js';
import { createBankAccount } from './shared/createBankAccount.js';
import { resolveBankFromMonoDetails } from './shared/resolveBank.js';
import { resolveCurrency } from './shared/resolveCurrency.js';
import { matchEngine } from './shared/smartMatching.js';

type Args = {
  code: string;
  providerKey: string;
  userId: string;
  companyId: string;
};

// export const handleBankConnection = async (args: Args) => {
//   const { code, providerKey, userId, companyId: providedCompanyId } = args;

//   const res = knexClient.transaction(async (trx) => {
//     const preRequisites = await getBankConnectionNeeds({
//       companyId: providedCompanyId,
//       trx,
//     });

//     const {
//       companyId,
//       updateOnboardingState,
//       hasUnmatchedAccounts,
//       unmatchedAccounts,
//     } = preRequisites;
//   });
// };

export const handleMonoConnection = async ({
  code,
  userId,
  companyId: providedCompanyId,
}: {
  code: string;
  providerKey?: string;
  userId: string;
  companyId: string;
}): Promise<ApiResponse<{ connections: ConnectionResponse[] }>> => {
  if (!code?.trim()) {
    return errorResponse('Invalid authorization code');
  }
  if (!userId?.trim()) {
    return errorResponse('User ID is required');
  }
  if (!providedCompanyId?.trim()) {
    return errorResponse('Company ID is required');
  }

  const secretKey = ENV.MONO_SECRET_KEY;
  if (!secretKey) throw new Error('Mono secret key not found');
  try {
    const res = await knexClient.transaction(async (trx) => {
      const preRequisites = await getBankConnectionNeeds({
        companyId: providedCompanyId,
        trx,
      });

      const {
        companyId,
        updateOnboardingState,
        hasUnmatchedAccounts,
        unmatchedAccounts,
        currentOnboardingState,
      } = preRequisites;

      let permanentMonoId: string;
      let account: any;
      let meta: any;

      try {
        const exchangeResult = await exchangeMonoCode({ code, secretKey });
        permanentMonoId = exchangeResult.permanentMonoId;

        const accountResult = await getMonoAccountDetails({
          accountId: permanentMonoId,
          secretKey,
        });

        account = accountResult.account;
        meta = accountResult.meta;
      } catch (error) {
        return errorResponse('Failed to connect to bank account. Please try again.', error);
      }

      const provider = await getProvider('mono', trx);

      // We should try to make sure user does not connect to the same account twice
      // TODO: Not handled yet, case where user is trying to connect to the same account via different provider
      // TODO: Maybe we should allow and if successful, update the existing connection

      // Check for duplicate connections
      const { exists, connection: existingConnection } = await checkForDuplicate({
        providerId: provider.id,
        providerUniqueBankAccountId: permanentMonoId,
        pruneStates: ['pending', 'error', 'revoked'],
        trx,
      });

      if (exists) {
        if (updateOnboardingState && currentOnboardingState) {
          await updateBankAccountOnboardingState(currentOnboardingState, companyId);
        }

        return successResponse('Bank account already connected', {
          connections: [
            {
              userActionRequired: false,
              connectionStatus: 'connected',
              message: 'Bank account already connected',
              connectionDetails: {
                connectionId: existingConnection?.id,
                providerId: provider.id,
                providerName: provider.name,
                providerKey: provider.key,
                providerBankAccountId: permanentMonoId,
                bankAccountId: existingConnection?.bankAccountId,
              },
              accountDetails: {
                accountNumber: account.account_number.toString(),
                accountName: account.name,
                bankName: account.institution.name,
                currency: account.currency,
              },
            },
          ],
        });
      }

      // Map bank, retrieve currency id
      const { bankId } = await resolveBankFromMonoDetails({
        providerId: provider.id,
        institutionName: account.institution.name,
        bankCode: account.institution.bank_code,
        institutionType: account.institution.type,
        trx,
      });

      const { currency } = await resolveCurrency({
        currencyCode: account.currency,
        trx,
      });

      if (!exists && !hasUnmatchedAccounts) {
        // TODO: Persist fully (Add bank account & connection) otherwise
        // Get currency, internal bank
        const newConnection = await addBankAccountConnection({
          userId,
          data: {
            providerId: provider.id,
            providerBankAccountId: permanentMonoId,
            bankAccountId: null,
            status: 'active',
            rawMetadata: meta,
          },
          trx,
        });

        const newBankAccount = await createBankAccount({
          bankId,
          userId,
          companyId,
          currencyId: currency.id,
          accountName: account.name,
          accountNumber: account.account_number.toString(),
        });

        await updateBankAccountOnboardingState(currentOnboardingState, companyId);

        // TODO: create formatConnectionResponse function and use here
        return successResponse('Bank account successfully connected - New bank account created', {
          connections: [
            {
              userActionRequired: false,
              connectionStatus: 'connected',
              message: 'Bank account successfully connected',
              connectionDetails: {
                connectionId: newConnection.data?.id,
                providerId: provider.id,
                providerName: provider.name,
                providerKey: provider.key,
                providerBankAccountId: permanentMonoId,
                bankAccountId: newBankAccount.bankAccountId,
              },
              accountDetails: {
                accountNumber: account.account_number.toString(),
                accountName: account.name,
                bankName: account.institution.name,
                currency: account.currency,
              },
            },
          ],
        });
      }

      if (!unmatchedAccounts) return errorResponse('No accounts to connect to');

      // Smart matching
      const matchResult = matchEngine({
        accountsInSystem: unmatchedAccounts,
        accountToBeMatched: {
          ...account,
          resolvedBankId: bankId,
          resolvedCurrencyId: currency.id,
          resolvedCurrencyCode: currency.code,
        },
      });

      if (matchResult.exactMatch) {
        await addBankAccountConnection({
          userId,
          data: {
            providerId: provider.id,
            providerBankAccountId: permanentMonoId,
            bankAccountId: matchResult.exactMatch.id,
            status: 'active',
            rawMetadata: meta,
          },
          trx,
        });
        await updateBankAccountOnboardingState(currentOnboardingState, companyId);
        return successResponse('Bank account successfully connected', {
          connections: [
            {
              userActionRequired: false,
              connectionStatus: 'connected',
              message: 'Bank account successfully connected',
              connectionDetails: {
                providerId: provider.id,
                providerName: provider.name,
                providerKey: provider.key,
                providerBankAccountId: permanentMonoId,
                bankAccountId: matchResult.exactMatch.id,
              },
              accountDetails: {
                accountNumber: account.account_number.toString(),
                accountName: account.name,
                bankName: account.institution.name,
                currency: account.currency,
              },
            },
          ],
        });
      }

      return successResponse('Unable to match account', {
        connections: [
          {
            userActionRequired: true,
            connectionStatus: 'pending',
            message: 'Connection successful but we are unable to match account',
            connectionDetails: {
              providerId: provider.id,
              providerName: provider.name,
              providerKey: provider.key,
              providerBankAccountId: permanentMonoId,
            },
            accountDetails: {
              accountNumber: account.account_number.toString(),
              accountName: account.name,
              bankName: account.institution.name,
              currency: account.currency,
            },
            suggestedBankAccountMatches: [...matchResult.fuzzyMatches, ...matchResult.unmatched],
          },
        ],
      });
    });

    return res;
  } catch (error) {
    return errorResponse('An unexpected error occured', error);
  }
};

export const addBankAccountConnection = async ({
  userId,
  data,
  checkExisting = false,
  trx,
}: CreateNewBankAccountConnection): Promise<ApiResponse<{ id: string }>> => {
  const validInput = bankAccountConnectionInputCamel.safeParse(data);
  if (!validInput.success) {
    return errorResponse('Invalid input provided', validInput.error.flatten());
  }
  const execute = async (knex: Knex.Transaction) => {
    if (checkExisting) {
      const { exists, connection } = await checkForDuplicate({
        providerUniqueBankAccountId: validInput.data.provider_bank_account_id,
        providerId: validInput.data.provider_id,
        pruneStates: ['error', 'pending', 'revoked'],
        trx: knex,
      });

      if (exists) {
        return successResponse('Bank account connection already exists', {
          id: connection?.id,
        });
      }
    }

    const toInsert = {
      ...validInput.data,
      created_by_id: userId,
    };

    const [row] = await knex('bank_account_connections').insert(toInsert).returning('id');

    if (!row?.id) {
      return errorResponse('Failed to create bank account connection');
    }

    return successResponse('Bank account connection successfully created', {
      id: row.id,
    });
  };
  try {
    const result = trx ? await execute(trx) : await knexClient.transaction(execute);

    return result;
  } catch (error) {
    return errorResponse('Failed to create bank account connection', error);
  }
};
