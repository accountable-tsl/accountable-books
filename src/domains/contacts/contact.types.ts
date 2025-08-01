import z from "zod";
import {
  createCamelCaseSchema,
  snakeToCamel,
  SnakeToCamelCaseObject,
} from "../../shared/utils/formatting.utils";
import { dbStandardFields } from "../../core/types/core";

export const contactStatus = z.enum(["active", "inactive"]);
export type ContactStatus = z.infer<typeof contactStatus>;

const contactInput = z.object({
  id: z.string().uuid().optional(),
  display_name: z.string().min(1).max(256),
  email: z
    .union([z.literal(""), z.string().email()])
    .transform((val) => (val === "" ? undefined : val))
    .optional(),
  address: z.string().max(512).optional(),
  status: contactStatus.default("active").optional(),
  notes: z.string().max(1024).optional(),
});
export const contactInputSchema = createCamelCaseSchema(contactInput);
export type ContactInput = SnakeToCamelCaseObject<z.infer<typeof contactInput>>;

const newContact = contactInput.extend({
  normalized_name: z.string().toLowerCase().min(1).max(256),
  company_id: z.string().uuid(),
  created_by_id: z.string().uuid(),
  updated_by_id: z.string().uuid().optional(),
});
export type NewContact = z.infer<typeof newContact>;

const contact = newContact.merge(dbStandardFields);
export type Contact = z.infer<typeof contact>;

export const updateContact = contactInput.partial().extend({
  id: z.string().uuid(),
});
export const updateContactSchema = createCamelCaseSchema(updateContact);
export type UpdateContact = SnakeToCamelCaseObject<
  z.infer<typeof updateContact>
>;

export type ContactResponse = {
  id: string;
  displayName: string;
  email?: string;
  address?: string;
  status: ContactStatus;
  notes?: string;
};
