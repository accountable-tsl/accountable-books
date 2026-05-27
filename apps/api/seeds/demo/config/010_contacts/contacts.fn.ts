import type { Knex } from 'knex';

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

    // Check if contacts already exist for this company (simple idempotency like COA)
    const existingContacts = await trx('contacts')
      .where({ company_id: companyId })
      .first();

    if (existingContacts) {
      console.log(
        `Contacts already exist for company ${company.shortCode}, skipping`,
      );
      continue;
    }

    // Prepare contacts for insertion
    const toInsert = item.contacts.map((contact) => ({
      email: contact.email,
      address: contact.address,
      notes: contact.notes,
      status: contact.status || 'active',
      display_name: contact.displayName,
      normalized_name: contact.displayName.trim().toLowerCase(),
      company_id: companyId,
      created_by_id: getUserId(item.user.email),
      updated_by_id: getUserId(item.user.email),
    }));

    // Insert contacts with generic conflict handling
    const insertedContacts = await trx('contacts')
      .insert(toInsert)
      .onConflict()
      .ignore()
      .returning([
        'id',
        'email',
        'display_name',
        'status',
        'company_id',
        'created_by_id',
      ]);

    // Store in state map for potential later use
    if (insertedContacts.length > 0) {
      demoContactsByCompanyMap.set(
        companyId,
        insertedContacts.map((contact) => ({
          id: contact.id,
          email: contact.email,
          displayName: contact.display_name,
          status: contact.status,
          companyId: contact.company_id,
          userId: getUserId(item.user.email),
        })),
      );
    }

    console.log(
      `Created ${insertedContacts.length} contacts for company ${company.shortCode}`,
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
