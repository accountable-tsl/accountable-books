import type { Knex } from 'knex';

import { normalizeContactName } from '../../../../src/domains/contacts/contact-normalization.utils.js';
import { deleteDemoData, getDemoUserMap } from '../../shared/utils.js';
import {
  generateDemoContactsMap,
  getRawContactsForInsertion,
} from './contacts.data.js';
import { demoContactsByCompanyMap } from './contacts.state.js';

import type { DemoFilter } from '../../shared/config.js';
import type { CompanyContactsMap } from './contacts.data.js';

/**
 * Create demo contacts in the database
 */
export const createDemoContacts = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  const contactsMap = await getRawContactsForInsertion(trx, filters);

  if (contactsMap.length === 0) {
    console.log('No companies found for contact creation');
    return;
  }

  // Get user mapping for dynamic user ID lookup
  const userMap = await getDemoUserMap(trx);

  // Helper to get user ID safely
  const getUserId = (email: string) => {
    const userId = userMap.get(email);
    if (!userId) {
      throw new Error(`Demo user not found for email: ${email}`);
    }
    return userId;
  };

  for (const item of contactsMap) {
    const company = item.company;
    const companyId = company.id;

    const userId = getUserId(item.user.email);
    const desiredByNormalizedName = new Map(
      item.contacts.map((contact) => [
        normalizeContactName(contact.displayName),
        contact,
      ]),
    );
    const normalizedNames = [...desiredByNormalizedName.keys()];
    const existingContacts = await trx('contacts')
      .where({ company_id: companyId })
      .whereIn('normalized_name', normalizedNames)
      .select('normalized_name');
    const existingNames = new Set(
      existingContacts.map((contact) => contact.normalized_name),
    );

    const toInsert = [...desiredByNormalizedName.entries()]
      .filter(([normalizedName]) => !existingNames.has(normalizedName))
      .map(([normalizedName, contact]) => ({
        email: contact.email.toLowerCase(),
        address: contact.address,
        notes: contact.notes,
        status: contact.status || 'active',
        display_name: contact.displayName,
        normalized_name: normalizedName,
        created_via: 'demo',
        review_status: 'confirmed',
        reviewed_by_id: userId,
        reviewed_at: trx.fn.now(),
        company_id: companyId,
        created_by_id: userId,
        updated_by_id: userId,
      }));

    if (toInsert.length > 0) {
      await trx('contacts').insert(toInsert);
    }

    const reconciledContacts = await trx('contacts')
      .where({ company_id: companyId })
      .whereIn('normalized_name', normalizedNames)
      .select([
        'id',
        'email',
        'display_name',
        'status',
        'company_id',
        'created_by_id',
      ]);

    demoContactsByCompanyMap.set(
      companyId,
      reconciledContacts.map((contact) => ({
        id: contact.id,
        email: contact.email,
        displayName: contact.display_name,
        status: contact.status,
        companyId: contact.company_id,
        userId,
      })),
    );

    console.log(
      `Created ${toInsert.length} contacts for company ${company.shortCode}`,
    );
  }
};

/**
 * Get demo contacts map (assumes contacts have been created)
 * Use createDemoContacts() first if needed
 */
export const getDemoContactsMap = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
): Promise<CompanyContactsMap[]> => {
  return generateDemoContactsMap(trx, filters);
};

/**
 * Delete demo contacts from the database
 */
export const deleteDemoContacts = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  // Clear the state map
  demoContactsByCompanyMap.clear();

  return await deleteDemoData({
    trx,
    table: 'contacts',
    filters,
  });
};
