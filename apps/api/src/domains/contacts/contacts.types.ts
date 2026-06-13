import type { contactType } from '@accountable-books/contracts/schema';
import type { Knex } from 'knex';
import z from 'zod';

import { type Pagination } from '../../shared/types/random.js';
import { createCamelCaseSchema } from '../../shared/utils/formatting.utils.js';

import type { SnakeToCamelCaseObject } from '../../shared/utils/formatting.utils.js';

export { contactType } from '@accountable-books/contracts/schema';
export type ContactType = z.infer<typeof contactType>;

export const contactStatus = z.enum(['active', 'archived']);
export type ContactStatus = z.infer<typeof contactStatus>;
export const contactCreatedVia = z.enum([
  'manual',
  'system_inferred',
  'import',
  'integration',
  'demo',
  'system',
]);
export type ContactCreatedVia = z.infer<typeof contactCreatedVia>;
export const contactReviewStatus = z.enum([
  'unreviewed',
  'confirmed',
  'rejected',
]);
export type ContactReviewStatus = z.infer<typeof contactReviewStatus>;

const optionalEmail = z
  .string()
  .trim()
  .refine((value) => value === '' || z.email().safeParse(value).success, {
    message: 'Invalid email address',
  })
  .transform((value) => (value === '' ? undefined : value.toLowerCase()))
  .optional();

const optionalTrimmedText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? undefined : value))
    .optional();

const contactInput = z.object({
  id: z.uuid().optional(),
  display_name: z.string().trim().min(1).max(256),
  email: optionalEmail,
  address: optionalTrimmedText(512),
  status: contactStatus.prefault('active').optional(),
  notes: optionalTrimmedText(1024),
});
export const contactInputSchema = createCamelCaseSchema(contactInput);
export type ContactInput = SnakeToCamelCaseObject<z.infer<typeof contactInput>>;

const newContact = contactInput.extend({
  normalized_name: z.string().toLowerCase().min(1).max(256),
  company_id: z.uuid(),
  created_via: contactCreatedVia.optional().default('manual'),
  review_status: contactReviewStatus.optional().default('confirmed'),
  created_by_id: z.uuid(),
  updated_by_id: z.uuid().optional(),
  deleted_by_id: z.uuid().nullish(),
  reviewed_by_id: z.uuid().nullish(),
  reviewed_at: z.date().nullish(),
  is_deleted: z.boolean().optional(),
  deleted_at: z.date().nullish(),
});
export type NewContact = z.infer<typeof newContact>;

export const contact = newContact.extend({
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});
export type Contact = z.infer<typeof contact>;

export const updateContact = contactInput.partial().extend({
  id: z.uuid(),
});
export const updateContactSchema = createCamelCaseSchema(updateContact);
export type UpdateContact = SnakeToCamelCaseObject<
  z.infer<typeof updateContact>
>;

export type ContactResponse = {
  contacts: Array<{
    id: string;
    displayName: string;
    email: string | null;
    address: string | null;
    status: ContactStatus;
    createdVia: ContactCreatedVia;
    reviewStatus: ContactReviewStatus;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  pagination: Pagination;
};

export const getContactsParams = z.object({
  companyId: z.string().nonempty(),
  ids: z.array(z.uuid()).optional(),
  displayNames: z.array(z.string().trim().min(1)).optional(),
  emails: z.array(z.email().trim().toLowerCase()).optional(),
  page: z.int().min(1).prefault(1),
  limit: z.int().min(1).max(100).prefault(30),
  search: z.string().trim().min(1).optional(),
  searchFields: z.array(z.enum(['displayName', 'email', 'notes'])).optional(),
  status: contactStatus.optional(),
  createdVia: contactCreatedVia.optional(),
  reviewStatus: contactReviewStatus.optional(),
  sortBy: z
    .enum(['display_name', 'email', 'created_at', 'updated_at'])
    .prefault('display_name'),
  sortOrder: z.enum(['asc', 'desc']).prefault('asc'),
  trx: z.any().optional(),
});

export type GetContactsParams = z.infer<typeof getContactsParams> & {
  trx?: Knex.Transaction;
};

export const deleteContactInput = z.object({
  id: z.uuid(),
});
export type DeleteContactInput = z.infer<typeof deleteContactInput>;
