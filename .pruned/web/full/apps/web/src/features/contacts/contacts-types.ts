import type { Pagination } from '@/shared/types/core';
import z from 'zod';

export const contactStatus = z.enum(['active', 'inactive']);
export type ContactStatus = z.infer<typeof contactStatus>;

export const newContact = z.object({
  displayName: z.string().min(2).max(256),
  email: z.union([z.literal(''), z.string().email()]).optional(),
  address: z.string().max(512).optional(),
  status: contactStatus.default('active').optional(),
  notes: z.string().max(1024).optional(),
});
export type NewContact = z.infer<typeof newContact>;

export type Contacts = NewContact & { id: string };

export const getContactsParams = z.object({
  companyId: z.string().nonempty(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(30),
  search: z.string().optional(),
  status: contactStatus.optional(),
  searchFields: z.array(z.enum(['displayName', 'email', 'notes'])).optional(),
  sortBy: z.enum(['display_name', 'email', 'created_at', 'updated_at']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export type GetContactsParams = z.infer<typeof getContactsParams>;

export type ContactResponse = {
  contacts: Contacts[];
  pagination: Pagination;
};
