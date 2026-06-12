import type { Knex } from 'knex';

import type { ContactType } from './contacts.types.js';

export async function ensureContactTypeAssignment({
  trx,
  companyId,
  contactId,
  contactType,
  userId = null,
}: {
  trx: Knex.Transaction;
  companyId: string;
  contactId: string;
  contactType: ContactType | null | undefined;
  userId?: string | null;
}): Promise<void> {
  if (!contactType) return;

  await trx('contact_type_assignments')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      type: contactType,
      created_by_id: userId,
      updated_by_id: userId,
    })
    .onConflict(['contact_id', 'type'])
    .merge({
      updated_by_id: userId,
      updated_at: trx.fn.now(),
    });
}
