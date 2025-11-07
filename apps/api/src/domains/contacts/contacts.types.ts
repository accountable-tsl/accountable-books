import z from 'zod';
import {
  createCamelCaseSchema,
  type SnakeToCamelCaseObject,
} from '../../shared/utils/formatting.utils.js';
import { dbStandardFields } from '../../core/types/core.js';
import type { Knex } from 'knex';
import { type Pagination } from '../../shared/types/random.js';

export const contactStatus = z.enum(['active', 'inactive']);
export type ContactStatus = z.infer<typeof contactStatus>;

export const contactType = z.enum([
  'customer', // anyone you invoice/collect money from; AR
  'vendor', // suppliers, service providers, card networks, AP;
  'employee', // payroll beneficiaries; distinct from contractors for compliance.
  'contractor', // freelancers/consultants you pay but who aren’t employees.
  'director', // board/management contacts tied to governance (minutes, approvals)
  'owner', // equity holders or principal partners
  'government', // tax authorities, regulators, statutory bodies, etc
  'internal', // company-controlled accounts/entities
  'banker',
  'other',
]);
export type ContactType = z.infer<typeof contactType>;

const contactInput = z.object({
  id: z.uuid().optional(),
  display_name: z.string().min(1).max(256),
  email: z
    .union([z.literal(''), z.email()])
    .transform((val) => (val === '' ? undefined : val))
    .optional(),
  address: z.string().max(512).optional(),
  status: contactStatus.prefault('active').optional(),
  notes: z.string().max(1024).optional(),
});
export const contactInputSchema = createCamelCaseSchema(contactInput);
export type ContactInput = SnakeToCamelCaseObject<z.infer<typeof contactInput>>;

const newContact = contactInput.extend({
  normalized_name: z.string().toLowerCase().min(1).max(256),
  company_id: z.uuid(),
  created_by_id: z.uuid(),
  updated_by_id: z.uuid().optional(),
});
export type NewContact = z.infer<typeof newContact>;

export const contact = newContact.merge(dbStandardFields);
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
    email?: string;
    address?: string;
    status: ContactStatus;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  pagination: Pagination;
};

export const getContactsParams = z.object({
  companyId: z.string().nonempty(),
  ids: z.array(z.uuid()).optional(),
  displayNames: z.array(z.string()).optional(),
  page: z.int().min(1).prefault(1),
  limit: z.int().min(1).max(100).prefault(30),
  search: z.string().optional(),
  searchFields: z.array(z.enum(['displayName', 'email', 'notes'])).optional(),
  status: contactStatus.optional(),
  sortBy: z
    .enum(['display_name', 'email', 'created_at', 'updated_at'])
    .prefault('display_name'),
  sortOrder: z.enum(['asc', 'desc']).prefault('asc'),
  trx: z.any().optional(),
});

export type GetContactsParams = z.infer<typeof getContactsParams> & {
  trx?: Knex.Transaction;
};
