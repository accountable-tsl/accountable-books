import { faker } from '@faker-js/faker';
import { ContactInput } from '../../../../src/domains/contacts/contact.types.js';

// Generate contacts without IDs; IDs are deterministically computed per-company at insert time
export function generateRandomContacts(count: number = 15): Omit<ContactInput, 'id'>[] {
  return Array.from({ length: count }, () => ({
    displayName: faker.company.name(),
    email: faker.internet.email(),
    notes: faker.company.catchPhrase(),
    address: faker.location.streetAddress({ useFullAddress: true }),
  }));
}
