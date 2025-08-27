import { faker } from '@faker-js/faker';
import type { DemoContactData } from './contacts.data.js';

/**
 * Generate random contacts for demo companies
 */
export function generateRandomContacts(count: number = 15): DemoContactData[] {
  return Array.from({ length: count }, () => ({
    displayName: faker.company.name(),
    email: faker.internet.email(),
    notes: faker.company.catchPhrase(),
    address: faker.location.streetAddress({ useFullAddress: true }),
    status: faker.helpers.arrayElement(['active', 'inactive']) as 'active' | 'inactive',
  }));
}
