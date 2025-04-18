import { companyType, zEmail } from "@/types/types";
import { z } from "zod";

export const passwordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  // Add later
  // .regex(/[A-Z]/, "One uppercase required")
  // .regex(/\d/, "One number required")
  // .regex(/[!@#$%^&*]/, "One symbol required"),
});

export const confirmPassword = passwordSchema
  .extend({
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const newUser = z.object({
  id: z.string().uuid().optional(),
  firstname: z
    .string()
    .min(2, "First name must be at least 2 characters")
    .max(256),
  email: zEmail,
  lastname: z.string().max(256).nullish(),
  password: passwordSchema.shape.password,
  phone_number: z.string().max(50).nullish(),
  avatar_url: z.string().nullish(),
});
export type NewUser = z.infer<typeof newUser>;

export const newCompany = z.object({
  legalName: z.string().max(256),
  countryId: z.string().uuid(),
  type: companyType,
  reportingCurrencyId: z.string().uuid(),
  yearEndDay: z.number().int().min(1).max(31),
  yearEndMonth: z.number().int().min(1).max(12),

  displayName: z.string().max(256).nullish(),
  industry: z.string().max(256).nullish(), // Add dropdown of industries
  teamSize: z.string().max(256).nullish(),
  revenue: z.string().max(256).nullish(),

  website: z.string().max(256).nullish(),
  address: z.string().max(256).nullish(), // where is your company located?
  description: z.string().max(256).nullish(),

  //Show these only for firms
  reportingFramework: z.string().max(256).nullish(),
  registrationNumber: z.string().max(256).nullish(),
  taxId: z.string().max(256).nullish(),
});
export type NewCompany = z.infer<typeof newCompany>;

export const defaultMockCompany: NewCompany = {
  legalName: "",
  countryId: "",
  type: "business",
  reportingCurrencyId: "",
  yearEndDay: 31,
  yearEndMonth: 12,
};

export const newFirm = z.object({
  legalName: z.string().max(256),
  countryId: z.string().uuid(),

  displayName: z.string().max(256).nullish(),
  firmType: z.string().max(256).nullish(),

  website: z.string().max(256).nullish(),
  address: z.string().max(256).nullish(),
  description: z.string().max(256).nullish(),

  firmSize: z.string().max(256).nullish(),
  revenue: z.string().max(256).nullish(),
});
export type NewFirm = z.infer<typeof newFirm>;

const baseSignupSchema = z.object({
  user: newUser,
  company: newCompany,
  firm: z.object({}).optional(),
});

const newClientSignup = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(20),
  firstname: z.string().min(3).max(20),
  lastname: z.string().min(3).max(20),
  companyType: companyType,
});
