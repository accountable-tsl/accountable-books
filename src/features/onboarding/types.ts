import { z } from "zod";

export const phoneNumberFormSchema = z.object({
  phone: z.object({
    phoneNumber: z.string().min(1, "Phone number is required"),
    countryCode: z.string(),
    completeNumber: z.string().min(1, "Phone number is required"),
  }),
});

export type PhoneNumberForm = z.infer<typeof phoneNumberFormSchema>;
