import { faker } from '@faker-js/faker';
import type { Knex } from 'knex';

import { createUser } from '../../../../migrations/20250403184441_users.js';
import { type DemoFilter } from '../../shared/config.js';
import { DEMO_USERS, NG_USER, US_USER } from './users.data.js';

export const createDemoUsers = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  // Determine which users to create based on filters
  let usersToCreate = DEMO_USERS;

  if (filters?.countryCodes?.length) {
    // Filter users based on country codes
    usersToCreate = DEMO_USERS.filter((user) => {
      if (user.email === US_USER.email && filters.countryCodes?.includes('US'))
        return true;
      if (user.email === NG_USER.email && filters.countryCodes?.includes('NG'))
        return true;
      return false;
    });
  }

  if (usersToCreate.length === 0) {
    console.log('No users to create based on filters');
    return;
  }

  // Check which users already exist
  const existingUsers = await trx('users')
    .whereIn(
      'email',
      usersToCreate.map((u) => u.email),
    )
    .select('email');

  const existingEmails = new Set(existingUsers.map((u) => u.email));
  const newUsers = usersToCreate.filter(
    (user) => !existingEmails.has(user.email),
  );

  if (newUsers.length === 0) {
    console.log('All required demo users already exist');
    return;
  }

  // Create new users idempotently
  for (const user of newUsers) {
    await createUser({
      user: {
        ...user,
        avatar_url: faker.image.avatar(),
        user_type: 'demo',
        email_verified_at: new Date(),
      },
      trx,
    });
  }

  console.log(
    `Users processed: ${newUsers.length} created, ${existingEmails.size} already existed`,
  );
};
export const deleteDemoUsers = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  // Smart user deletion logic - only delete users if we're deleting ALL companies for their country
  // Otherwise users shared between companies will cause foreign key violations

  if (!filters) {
    // No filters = delete all demo users
    await trx('users').where('user_type', 'demo').delete();
    console.log('Deleted all demo users');
    return;
  }

  // Check if this is a complete country deletion
  const isCompleteCountryDeletion = (countryCode: string) => {
    if (
      filters.countryCodes?.length === 1 &&
      filters.countryCodes[0] === countryCode
    ) {
      // Only delete if no other filters restrict companies within this country
      return !filters.companyIds?.length && !filters.companyTypes?.length;
    }
    return false;
  };

  const userEmailsToDelete: string[] = [];

  if (isCompleteCountryDeletion('US')) {
    userEmailsToDelete.push(US_USER.email);
  }
  if (isCompleteCountryDeletion('NG')) {
    userEmailsToDelete.push(NG_USER.email);
  }

  if (userEmailsToDelete.length > 0) {
    await trx('users')
      .whereIn('email', userEmailsToDelete)
      .where('user_type', 'demo')
      .delete();
    console.log(`Deleted ${userEmailsToDelete.length} demo users`);
  } else {
    console.log(
      'Skipping user deletion - partial filter would cause foreign key violations',
    );
  }
};
