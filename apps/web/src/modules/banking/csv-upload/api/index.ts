import api from '@/lib/axios';
import { isAxiosError } from 'axios';
import type { BankTransactionBatchInsert } from '@/modules/banking/csv-upload/model/types';

// const normalize = (txn) => ({
//   date: txn.date, // already YYYY-MM-DD
//   amount: Number(txn.amount).toFixed(4), // 4dp
//   payee: (txn.payee || '').toLowerCase().replace(/\s+/g, ' ').trim(),
//   description: (txn.description || '').toLowerCase().replace(/\s+/g, ' ').trim(),
// });

// async function generateApiTransactionsFingerprint(transactions) {
//   // 1. Normalize
//   const normalized = transactions.map(normalize);

//   // 2. Sort
//   normalized.sort((a, b) => {
//     return (
//       a.date.localeCompare(b.date) ||
//       a.amount.localeCompare(b.amount) ||
//       a.payee.localeCompare(b.payee)
//     );
//   });

//   // 3. Serialize
//   const json = JSON.stringify(normalized);

//   // 4. Hash
//   const buffer = new TextEncoder().encode(json);
//   const digest = await crypto.subtle.digest('SHA-256', buffer);
//   return Array.from(new Uint8Array(digest))
//     .map((b) => b.toString(16).padStart(2, '0'))
//     .join('');
// }

export async function uploadBankTransactions(
  companyId: string,
  data: BankTransactionBatchInsert,
) {
  try {
    const res = await api.post(
      `/api/${companyId}/bank-accounts/transactions/import`,
      data,
    );

    return res.data;
  } catch (err) {
    if (isAxiosError(err) && err.response?.data) {
      return err.response.data;
    }

    throw err;
  }
}
