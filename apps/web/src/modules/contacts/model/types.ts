import type { Pagination } from '@/shared/types/core';
import z from 'zod';

export const contactStatus = z.enum(['active', 'archived']);
export type ContactStatus = z.infer<typeof contactStatus>;

export const newContact = z.object({
  displayName: z.string().min(2).max(256),
  email: z.union([z.literal(''), z.email()]).optional(),
  address: z.string().max(512).optional(),
  status: contactStatus.prefault('active').optional(),
  notes: z.string().max(1024).optional(),
});
export type NewContact = z.infer<typeof newContact>;

export type Contacts = NewContact & { id: string };

export const getContactsParams = z.object({
  companyId: z.string().nonempty(),
  page: z.int().min(1).prefault(1),
  limit: z.int().min(1).max(100).prefault(30),
  search: z.string().optional(),
  status: contactStatus.optional(),
  searchFields: z.array(z.enum(['displayName', 'email', 'notes'])).optional(),
  sortBy: z
    .enum(['display_name', 'email', 'created_at', 'updated_at'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export type GetContactsParams = z.infer<typeof getContactsParams>;

export type ContactResponse = {
  contacts: Contacts[];
  pagination: Pagination;
};

export const contactType = z.enum([
  'customer', // anyone you invoice/collect money from; AR
  'vendor', // suppliers, service providers, card networks, AP;
  'employee', // payroll beneficiaries; distinct from contractors for compliance.
  'contractor', // freelancers/consultants you pay but who aren't employees.
  'director', // board/management contacts tied to governance (minutes, approvals)
  'owner', // equity holders or principal partners
  'government', // tax authorities, regulators, statutory bodies, etc
  'internal', // company-controlled accounts/entities
  'banker',
  'other',
]);

export type ContactType = z.infer<typeof contactType>;
