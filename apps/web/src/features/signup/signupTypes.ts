import { isValidSlug, validateSlug } from '@/domains/firms/utils';
import { companyType, zEmail } from '@/shared/types/core';
import { sanitizeInput, sanitizeOptionalInput } from '@/shared/utils/old-utils';
import { z } from 'zod';

const slugRegex = /^(?=[a-z-]{3,15}$)[a-z]+(-[a-z]+)*$/;

export const passwordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
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
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const newUser = z.object({
  id: z.uuid().optional(),
  firstname: z
    .string()
    .min(2, 'First name must be at least 2 characters')
    .max(256, 'First name must not exceed 256 characters')
    .transform(sanitizeInput),
  email: zEmail,
  lastname: z.string().max(256).transform(sanitizeOptionalInput).nullish(),
  password: passwordSchema.shape.password,
  phoneNumber: z
    .string()
    .max(20, 'Phone number cannot exceed 50 characters')
    .transform(sanitizeOptionalInput)
    .nullish(),
  avatarUrl: z.url('Avatar must be a valid URL')
    .transform(sanitizeOptionalInput)
    .nullish(),
});
export type NewUser = z.infer<typeof newUser>;

export const newCompany = z
  .object({
    legalName: z.string().max(256, 'Name cannot exceed 256 characters').transform(sanitizeInput),
    countryId: z.uuid(),
    type: companyType,
    reportingCurrencyId: z.uuid(),
    yearEndDay: z.coerce
      .number()
      .min(1, 'Day must be between 1-31')
      .max(31, 'Day must be between 1-31'),
    yearEndMonth: z.coerce
      .number()
      .min(1, 'Month must be between 1-12')
      .max(12, 'Month must be between 1-12'),
    displayName: z.string().max(256).nullish(),
    industry: z.string().max(256).transform(sanitizeOptionalInput).nullish(), // Add dropdown of industries
    teamSize: z.string().max(256).nullish(),
    revenue: z.string().max(256).nullish(),

    website: z.string().max(256).nullish(),
    address: z
      .string()
      .max(512, 'Address cannot exceed 512 characters')
      .transform(sanitizeOptionalInput)
      .nullish(),
    description: z
      .string()
      .max(2000, 'Description cannot exceed 2000 characters')
      .transform(sanitizeOptionalInput)
      .nullish(),

    reportingFramework: z.string().max(256).nullish(),
    registrationNumber: z.string().max(256).nullish(),
    taxId: z.string().max(256).nullish(),
    slug: z.string().min(3).max(15).nullish(),
  })
  .superRefine((data, ctx) => {
    const { yearEndMonth, yearEndDay, slug } = data;
    const thirtyDayMonths = [4, 6, 9, 11]; // Apr, Jun, Sep, Nov

    if (yearEndMonth === 2 && yearEndDay > 28) {
      ctx.addIssue({
        code: "custom",
        message: 'February fiscal end has 28 days at most',
        path: ['yearEndDay'],
      });
    }

    if (thirtyDayMonths.includes(yearEndMonth) && yearEndDay > 30) {
      ctx.addIssue({
        code: "custom",
        message: 'This month has only 30 days',
        path: ['yearEndDay'],
      });
    }

    if (slug != null) {
      const result = validateSlug(slug, false);
      if (!result.isValid) {
        ctx.addIssue({
          code: "custom",
          message: result.error || 'Invalid slug',
          path: ['slug'],
        });
      }
    }
  });
export type NewCompany = z.infer<typeof newCompany>;

export const newFirm = z.object({
  legalName: z.string().max(256),
  countryId: z.uuid(),

  displayName: z.string().max(256).nullish(),
  firmType: z.string().max(256).nullish(),

  website: z.string().max(256).nullish(),
  address: z.string().max(256).nullish(),
  description: z.string().max(256).nullish(),

  firmSize: z.string().max(256).nullish(),
  revenue: z.string().max(256).nullish(),
});
export type NewFirm = z.infer<typeof newFirm>;

export const signupUser = z.object({
  user: newUser,
  company: newCompany,
});

export const signupFirm = z.object({
  user: newUser,
  company: newCompany,
  firm: newFirm,
});
