import z from "zod";

export const contactStatus = z.enum(["active", "inactive"]);
export type ContactStatus = z.infer<typeof contactStatus>;

export const newContact = z.object({
  displayName: z.string().min(2).max(256),
  email: z.union([z.literal(""), z.string().email()]).optional(),
  address: z.string().max(512).optional(),
  status: contactStatus.default("active").optional(),
  notes: z.string().max(1024).optional(),
});
export type NewContact = z.infer<typeof newContact>;

export type Contacts = NewContact & { id: string };
