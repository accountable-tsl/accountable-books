import Decimal from "decimal.js";
import knexClient from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import { getCompanyUUID } from "../../shared/utils/random.utils";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { getBankAccountBalances } from "../balances/balances.model";
import {
  AddBankTransactionsResponse,
  bankTransactionBatchInputCamel,
  BankTransactionBatchInputCamel,
  BankTransactionFilters,
  bankTransactionsFilters,
  newBankTransaction,
  NewBankTransaction,
} from "./bankTransactions.types";
import { determineExchangeRate } from "../exchangeRates/exchangeRates.utils";
import { categorizationStatus, debitCredit } from "../../core/types/core";
import { snakeToCamel } from "../../shared/utils/formatting.utils";
import { buildBankTransactionQuery } from "./bankTransactions.utils";

export async function addNewBankTransactions({
  userId,
  companyId,
  data,
}: {
  userId: string;
  companyId: string;
  data: BankTransactionBatchInputCamel;
}): Promise<ApiResponse<AddBankTransactionsResponse>> {
  try {
    const validateInput = bankTransactionBatchInputCamel.safeParse(data);
    if (!validateInput.success) {
      return errorResponse(
        `Invalid input provided`,
        validateInput.error.flatten()
      );
    }

    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse("Invalid company ID");
    }

    const batch = validateInput.data;
    const result = await knexClient.transaction(async (trx) => {
      // Fetch the relevant bank account, join companies for reportingCurrencyId. Also acts to verify bank account exists
      const bankAccount = await trx("bank_accounts as ba")
        .select(
          "ba.id as bankAccountId",
          "ba.currency_id as bankCurrencyId",
          "c.reporting_currency_id as reportingCurrencyId"
        )
        .join("companies as c", "ba.company_id", "c.id")
        .where({
          "ba.id": batch.bank_account_id,
          "ba.company_id": companyUUID,
          "ba.is_deleted": false,
        })
        .first();

      console.log({ bankAccount });
      if (!bankAccount) return errorResponse("Bank account not found");
      const { bankAccountId, bankCurrencyId, reportingCurrencyId } =
        bankAccount;

      // Fetch existing transactions to calculate balanceBefore
      /**
       * I guess  we can just use getBankAccountBalances, not sure which is best
       * const existingTransactions = await trx("BankTransaction").where({ bank_account_id: data.bankAccountId }).orderBy("date", "asc");
       * const balanceBefore = existingTransactions.reduce((total: Decimal, txn: any) => total.plus(new Decimal(txn.amount)),new Decimal(0));
       */
      //

      const balanceBeforeResponse = await getBankAccountBalances(
        trx,
        companyUUID,
        {
          includeStats: true,
          bankAccountIds: [bankAccountId],
        }
      );
      console.log({ balanceBeforeResponse });
      if (!balanceBeforeResponse.success || !balanceBeforeResponse.data) {
        return errorResponse(
          "Failed to calculate balance before new transactions"
        );
      }
      const balanceBeforeObj = balanceBeforeResponse.data[bankAccountId];

      console.log({ balanceBeforeObj });
      //   ----
      // Sort and Calculate or verify batch total
      const sortedTransactions = [...batch.bank_transactions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      let currentRunningBalance = balanceBeforeObj.nativeBalance;
      let batchTotal = 0;

      // Prepare each transaction, resolve system exchange rate
      const preparedTransactions: NewBankTransaction[] = await Promise.all(
        sortedTransactions.map(async (txn) => {
          const txnAmount = Number(txn.amount);
          batchTotal = batchTotal += txnAmount;
          currentRunningBalance = currentRunningBalance += txnAmount;

          // Resolve exchange rate perhaos we could skip this if reportingCurrencyId === bankCurrencyId
          let exr: number;

          if (reportingCurrencyId === bankCurrencyId) {
            exr = 1;
          } else {
            const exchangeRate = await determineExchangeRate(
              txn.date,
              reportingCurrencyId,
              bankCurrencyId
            );
            if (exchangeRate === null) {
              throw new Error(
                `Exchange rate not available for ${txn.date}: ${reportingCurrencyId} to ${bankCurrencyId}`
              );
            }
            exr = Number(exchangeRate);
          }

          const txForDb = {
            ...txn,
            amount: txnAmount,
            absolute_amount: Math.abs(txnAmount),
            system_exchange_rate: exr,
            transaction_side:
              txnAmount < 0 ? debitCredit.enum.credit : debitCredit.enum.debit,
            categorization_status: categorizationStatus.enum.uncategorized,
            bank_transaction_batch_id: undefined, // to be set after batch insert
            created_by_id: userId,
            updated_by_id: userId,
          };

          const validateTx = newBankTransaction.safeParse(txForDb);
          if (!validateTx.success) {
            throw new Error(validateTx.error.message);
          }

          // Compose prepared transaction
          return validateTx.data;
        })
      );

      // Confirm balance after
      const balanceAfter = balanceBeforeObj.nativeBalance + batchTotal;
      if (Math.abs(balanceAfter - currentRunningBalance) > 0.0001) {
        return errorResponse("Arithmetic error: balance mismatch", {
          calculatedBalance: balanceAfter.toString(),
          runningBalance: currentRunningBalance.toString(),
        });
      }

      // Insert bank transaction batch
      const [thisBatch] = await trx("bank_transaction_batches")
        .insert({
          bank_account_id: bankAccountId,
          import_date: new Date(),
          start_date: batch.start_date,
          end_date: batch.end_date,
          source: batch.source,
          balance_before: balanceBeforeObj.nativeBalance,
          balance_after: balanceAfter,
          created_by_id: userId,
          updated_by_id: userId,
        })
        .returning([
          "id",
          "start_date",
          "end_date",
          "balance_before",
          "balance_after",
          "source",
        ]);

      // Insert prepared transactions with batch id
      await trx("bank_transactions").insert(
        preparedTransactions.map((txn) => ({
          ...txn,
          bank_transaction_batch_id: thisBatch.id,
        }))
      );
      // Return balance sorted by date and created_at if not already sorted
      //   ----
      // Return result
      return successResponse("Transactions imported successfully", {
        batch: snakeToCamel(thisBatch),
        transactionsCount: preparedTransactions.length,
        batchTotal,
        balanceAfter,
      });
    });

    return result;
  } catch (error) {
    return errorResponse("Failed to import transactions", error);
  }
}

// async function recalcBalancesAfterBatchDelete(knex, bankAccountId, deletedBatchStartDate) {
//   // Fetch all batches for the account, ordered by start_date
//   const batches = await knex('bank_transaction_batches')
//     .where('bank_account_id', bankAccountId)
//     .andWhere('start_date', '>', deletedBatchStartDate)
//     .orderBy('start_date');

//   let runningBalance = /* fetch latest balance_before before deleted batch */;

//   for (const batch of batches) {
//     // sum up all transaction amounts in batch
//     const sum = await knex('bank_transactions')
//       .where('bank_transaction_batch_id', batch.id)
//       .andWhere('is_deleted', false)
//       .sum('amount as total')
//       .first();

//     const balanceBefore = runningBalance;
//     const balanceAfter = balanceBefore + Number(sum.total || 0);

//     // update batch balances
//     await knex('bank_transaction_batches')
//       .where('id', batch.id)
//       .update({
//         balance_before: balanceBefore,
//         balance_after: balanceAfter,
//       });

//     runningBalance = balanceAfter;
//   }
// }

export async function getBankTransactions(
  companyId: string,
  filters: BankTransactionFilters
) {
  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse("Invalid company ID");
    }

    const validateFilters = bankTransactionsFilters.safeParse(filters);
    if (!validateFilters.success) {
      return errorResponse(validateFilters.error.message);
    }
    const validFilters = validateFilters.data;
    console.log({ companyUUID, validFilters });

    const baseQuery = buildBankTransactionQuery({
      knex: knexClient,
      companyId: companyUUID,
      filters: validFilters,
    });

    console.log({ baseQuery });
    const transactionsQuery = baseQuery;

    const countQuery = baseQuery
      .clone()
      .clearSelect()
      .countDistinct("BankTransaction.id as total")
      .first();

    const [transactions, countResult] = await Promise.all([
      transactionsQuery,
      countQuery,
    ]);

    const total = countResult ? parseInt(String(countResult.total), 10) : 0;

    return successResponse("Bank transactions retrieved successfully", {
      transactions,
      total,
      pageSize: validFilters?.pageSize || total,
      currentPage: validFilters?.currentPage || 1,
    });
  } catch (error) {
    return errorResponse("Failed to get retrieve bank transactions", error);
  }
}
