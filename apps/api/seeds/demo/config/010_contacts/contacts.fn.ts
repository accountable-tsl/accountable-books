import type { Knex } from 'knex';
import { addNewContacts } from '../../../../src/domains/contacts/contacts.model.js';
import { ContactInput } from '../../../../src/domains/contacts/contact.types.js';
import { deleteDemoData } from '../../shared/utils.js';
import { generateDemoContactsMap } from './contacts.data.js';
import { DemoFilter } from '../../shared/config.js';
import { dedupeByNormalizedKey, normalizeName, uuidV5ForCompanyName } from '../../shared/id.js';
const createContactsHelper = async (
  contacts: ContactInput[],
  companyId: string,
  userId: string,
  trx: Knex.Transaction,
) => {
  const res = await addNewContacts({ input: contacts, trx, companyId, userId });
  if (!res.success) {
    throw new Error(res.message || 'Failed to create demo contacts');
  }
  return res.data;
};

// const createDemoContactsForRegion = async (input: DemoContactsMap, trx: Knex.Transaction) => {
//   const { companies, contacts, user } = input;
//   for (const company of companies) {
//     const contactsForType = contacts[company.companyType];
//     if (contactsForType) {
//       await createContactsHelper(contactsForType, company.id, user.id, trx);
//     }
//   }
// };

export const createDemoContacts = async (trx: Knex.Transaction, filters?: DemoFilter) => {
  const contactsMap = generateDemoContactsMap(filters);

  if (contactsMap.length === 0) {
    console.log('Found no contacts to create');
    return;
  }

  const errors: string[] = [];
  for (const item of contactsMap) {
    const { contacts, user, company } = item;

    // 1) Deduplicate within batch by normalized display name
    const deduped = dedupeByNormalizedKey(contacts, (c) => c.displayName);

    // 2) Compute deterministic IDs per (companyId, normalizedName)
    const withIds: ContactInput[] = deduped.map((c) => ({
      ...c,
      id: uuidV5ForCompanyName(company.id, c.displayName),
    }));

    const res = await addNewContacts({
      input: withIds,
      trx,
      companyId: company.id,
      userId: user.id,
    });
    if (!res.success) {
      errors.push(`Failed to create demo contacts for ${company.name}: ${res.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
};

export const deleteDemoContacts = async (trx: Knex.Transaction, filters?: DemoFilter) => {
  return await deleteDemoData({
    trx,
    table: 'contacts',
    filters,
  });
};
