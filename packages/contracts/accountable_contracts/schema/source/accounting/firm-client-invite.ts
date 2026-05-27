import { z } from 'zod';

import { accountingBasis, reportingFramework } from '../common/enums.js';

export const firmInviteInvitedCompanyRoleSchema = z.literal('client_owner');
export type FirmInviteInvitedCompanyRole = z.infer<
  typeof firmInviteInvitedCompanyRoleSchema
>;

export const firmClientInviteInviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter an email address')
    .toLowerCase()
    .pipe(z.email({ error: 'Enter a valid email address' })),
  primaryContactName: z
    .string()
    .trim()
    .max(256, 'Contact name must be 256 characters or fewer')
    .optional(),
  invitedCompanyRole:
    firmInviteInvitedCompanyRoleSchema.default('client_owner'),
  note: z
    .string()
    .trim()
    .max(500, 'Note must be 500 characters or fewer')
    .optional(),
});
export type FirmClientInviteInvite = z.infer<
  typeof firmClientInviteInviteSchema
>;

export const firmClientInviteAssigneeInviteSchema = z.object({
  assigneeUserId: z.uuid().optional(),
  invite: firmClientInviteInviteSchema,
});
export type FirmClientInviteAssigneeInvite = z.infer<
  typeof firmClientInviteAssigneeInviteSchema
>;

const firmInviteDefaultTimezoneSchema = z
  .string()
  .regex(
    /^[A-Za-z]+\/[A-Za-z_]+$/,
    'Use an IANA timezone (e.g. America/New_York)',
  );

function refineFirmInviteYearEnd(
  data: { yearEndMonth: number; yearEndDay: number },
  ctx: z.RefinementCtx,
): void {
  const { yearEndMonth, yearEndDay } = data;
  const thirtyDayMonths = [4, 6, 9, 11];

  if (yearEndMonth === 2 && yearEndDay > 28) {
    ctx.addIssue({
      code: 'custom',
      message: 'February fiscal end has 28 days at most',
      path: ['yearEndDay'],
    });
  }

  if (thirtyDayMonths.includes(yearEndMonth) && yearEndDay > 30) {
    ctx.addIssue({
      code: 'custom',
      message: 'This month has only 30 days',
      path: ['yearEndDay'],
    });
  }
}

const firmInviteCompanyStep2Fields = {
  legalName: z
    .string()
    .trim()
    .min(2, 'Enter a legal name')
    .max(256, 'Legal name must be 256 characters or fewer'),
  countryId: z.uuid('Select a country'),
  reportingCurrencyId: z.uuid('Select a reporting currency'),
  registrationNumber: z.string().trim().max(256).optional(),
  taxId: z.string().trim().max(256).optional(),
  defaultTimezone: firmInviteDefaultTimezoneSchema.optional(),
};

export const firmClientInviteCompanyStep2BusinessSchema = z.object({
  type: z.literal('business'),
  ...firmInviteCompanyStep2Fields,
  industry: z
    .string()
    .trim()
    .min(1, 'Select an industry')
    .max(256, 'Industry must be 256 characters or fewer'),
});

export const firmClientInviteCompanyStep2IndividualSchema = z.object({
  type: z.literal('individual'),
  ...firmInviteCompanyStep2Fields,
  industry: z
    .string()
    .trim()
    .max(256, 'Industry must be 256 characters or fewer')
    .optional(),
});

export const firmClientInviteCompanyStep2Schema = z.discriminatedUnion('type', [
  firmClientInviteCompanyStep2BusinessSchema,
  firmClientInviteCompanyStep2IndividualSchema,
]);
export type FirmClientInviteCompanyStep2 = z.infer<
  typeof firmClientInviteCompanyStep2Schema
>;

export const firmClientInviteWizardSteps12Schema =
  firmClientInviteAssigneeInviteSchema.extend({
    company: firmClientInviteCompanyStep2Schema,
  });
export type FirmClientInviteWizardSteps12 = z.infer<
  typeof firmClientInviteWizardSteps12Schema
>;

const firmInviteCompanyProfileFields = {
  legalName: z
    .string()
    .trim()
    .min(2, 'Enter a legal name')
    .max(256, 'Legal name must be 256 characters or fewer'),
  countryId: z.uuid('Select a country'),
  reportingCurrencyId: z.uuid('Select a reporting currency'),
  yearEndDay: z.coerce
    .number()
    .min(1, 'Day must be between 1-31')
    .max(31, 'Day must be between 1-31'),
  yearEndMonth: z.coerce
    .number()
    .min(1, 'Month must be between 1-12')
    .max(12, 'Month must be between 1-12'),
  accountingBasis: accountingBasis,
  displayName: z.string().trim().max(256).optional(),
  website: z.string().trim().max(256).optional(),
  revenue: z.string().trim().max(256).optional(),
  teamSize: z.string().trim().max(256).optional(),
  address: z.string().trim().max(512).optional(),
  description: z.string().trim().max(2000).optional(),
  registrationNumber: z.string().trim().max(256).optional(),
  taxId: z.string().trim().max(256).optional(),
  defaultTimezone: firmInviteDefaultTimezoneSchema.optional(),
};

export const firmClientInviteCompanyBusinessSchema = z
  .object({
    type: z.literal('business'),
    ...firmInviteCompanyProfileFields,
    reportingFramework: reportingFramework,
    industry: z
      .string()
      .trim()
      .min(1, 'Select an industry')
      .max(256, 'Industry must be 256 characters or fewer'),
  })
  .superRefine(refineFirmInviteYearEnd);

export const firmClientInviteCompanyIndividualSchema = z
  .object({
    type: z.literal('individual'),
    ...firmInviteCompanyProfileFields,
    reportingFramework: reportingFramework.optional(),
    industry: z.string().trim().max(256).optional(),
  })
  .superRefine(refineFirmInviteYearEnd);

export const firmClientInviteCompanySchema = z.discriminatedUnion('type', [
  firmClientInviteCompanyBusinessSchema,
  firmClientInviteCompanyIndividualSchema,
]);
export type FirmClientInviteCompany = z.infer<
  typeof firmClientInviteCompanySchema
>;

export const firmClientInviteWizardSteps123Schema =
  firmClientInviteAssigneeInviteSchema.extend({
    company: firmClientInviteCompanySchema,
  });
export type FirmClientInviteWizardSteps123 = z.infer<
  typeof firmClientInviteWizardSteps123Schema
>;

export const firmClientInviteRequestSchema =
  firmClientInviteAssigneeInviteSchema.extend({
    firmCompanyId: z.uuid(),
    company: firmClientInviteCompanySchema,
  });
export type FirmClientInviteRequest = z.infer<
  typeof firmClientInviteRequestSchema
>;

export const firmClientInviteResponseSchema = z.object({
  invitationId: z.uuid(),
  status: z.enum(['pending', 'sent', 'failed']),
  expiresAt: z.iso.datetime().optional(),
  clientCompanyId: z.uuid().optional(),
});
export type FirmClientInviteResponse = z.infer<
  typeof firmClientInviteResponseSchema
>;
