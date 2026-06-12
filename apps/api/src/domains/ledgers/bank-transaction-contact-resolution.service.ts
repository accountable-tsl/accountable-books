import type { Knex } from 'knex';

import type { ContactType } from '../contacts/index.js';

export type BankTransactionContactResolution = {
  contact_id: string | null;
  contact_type: ContactType | null;
};

const emptyResolution: BankTransactionContactResolution = {
  contact_id: null,
  contact_type: null,
};

export async function getBankTransactionContactResolution({
  companyId,
  bankTransactionId,
  trx,
}: {
  companyId: string;
  bankTransactionId: string;
  trx: Knex.Transaction;
}): Promise<BankTransactionContactResolution> {
  const resolutions = await getBankTransactionContactResolutions({
    companyId,
    bankTransactionIds: [bankTransactionId],
    trx,
  });

  return resolutions.get(bankTransactionId) ?? emptyResolution;
}

export async function getBankTransactionContactResolutions({
  companyId,
  bankTransactionIds,
  trx,
}: {
  companyId: string;
  bankTransactionIds: string[];
  trx: Knex.Transaction;
}): Promise<Map<string, BankTransactionContactResolution>> {
  const uniqueBankTransactionIds = Array.from(new Set(bankTransactionIds));
  const resolutionByBankTransactionId = new Map<
    string,
    BankTransactionContactResolution
  >();

  if (uniqueBankTransactionIds.length === 0) {
    return resolutionByBankTransactionId;
  }

  const rows = await trx('bank_transaction_contact_resolutions as bcr')
    .join('contacts as c', function joinContacts() {
      this.on('c.id', '=', 'bcr.contact_id').andOn(
        'c.company_id',
        '=',
        'bcr.company_id',
      );
    })
    .where('bcr.company_id', companyId)
    .whereIn('bcr.bank_transaction_id', uniqueBankTransactionIds)
    .whereIn('bcr.status', ['inferred', 'confirmed', 'manual_override'])
    .where('c.status', 'active')
    .select(
      'bcr.bank_transaction_id',
      'bcr.contact_id',
      'bcr.contact_type',
    );

  for (const row of rows as Array<{
    bank_transaction_id: string;
    contact_id: string;
    contact_type: ContactType | null;
  }>) {
    resolutionByBankTransactionId.set(row.bank_transaction_id, {
      contact_id: row.contact_id,
      contact_type: row.contact_type ?? null,
    });
  }

  return resolutionByBankTransactionId;
}
