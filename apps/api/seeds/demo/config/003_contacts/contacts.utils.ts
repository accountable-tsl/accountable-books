import { faker } from '@faker-js/faker';
import { ContactInput } from '../../../../src/domains/contacts/contact.types.js';

// Predefined UUIDs for consistent contact references
const CONTACT_UUIDS = [
  '0198d36f-0f6a-755b-a545-160e02d24096',
  '0198d36f-0f6a-7d8a-859a-a5ff0c0236b6',
  '0198d36f-0f6a-7e93-ae94-3ca3d0eef6c8',
  '0198d36f-0f6a-7d41-8e6e-09477375246f',
  '0198d36f-0f6a-78df-b48c-d704975b6aab',
  '0198d36f-0f6a-7dfd-8d14-55c4fd607fff',
  '0198d36f-0f6a-7001-beef-fae032ca8151',
  '0198d36f-0f6a-78ee-bd84-5646f82dc82a',
  '0198d36f-0f6a-7b7c-ab94-abf8d279cb92',
  '0198d36f-0f6a-7216-94b3-b2c36d068e9e',
  '0198d36f-0f6a-7192-a73b-7aa7cd7e8d74',
  '0198d36f-0f6a-70d6-8dd2-a333e543ecbc',
  '0198d36f-0f6a-7f7a-b223-903808d6df99',
  '0198d373-c507-7d8d-b154-9d643834220b',
  '0198d373-c507-7f54-b6df-58135351b9bb',
  '0198d373-c507-776d-8b1e-3967ad194357',
  '0198d373-c507-7d43-b030-35233a6f6126',
  '0198d373-c507-7522-b5b2-961f1c004b26',
  '0198d373-c507-7b86-b136-4b1baf9d0cff',
  '0198d373-c507-7875-92a9-8a222c457980',
  '0198d373-c507-708a-93f1-54b543594a0a',
  '0198d373-c507-7f12-b549-c97739f34211',
  '0198d373-c507-7bab-ad0d-66380d700815',
];

export function generateRandomContacts(count: number = 15) {
  return Array.from({ length: count }, (_, index) => ({
    id: CONTACT_UUIDS[index] || faker.string.uuid(), // Use predefined UUIDs first, fallback to random
    displayName: faker.company.name(),
    email: faker.internet.email(),
    notes: faker.company.catchPhrase(),
    address: faker.location.streetAddress({ useFullAddress: true }),
  }));
}
