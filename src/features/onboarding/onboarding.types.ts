import { z } from "zod";

const userOnboardingSteps = z
  .object({
    email_verified: z.boolean().default(false),
    // possibly add: profile_completed, T&C accepted, etc.
  })
  .default({
    email_verified: false,
  });

const companyOnboardingSteps = z
  .object({
    company_details_confirmed: z.boolean().default(false),
    first_bank_account_added: z.boolean().default(false),
    // Add more steps as needed
  })
  .default({
    company_details_confirmed: false,
    first_bank_account_added: false,
  });

const companyOnboardingStepsCompletedAt = z
  .object({
    company_details_confirmed: z.date().optional(),
    first_bank_account_added: z.date().optional(),
  })
  .optional();

export const companyOnboardingState = z
  .object({
    steps: companyOnboardingSteps,
    completed_at: companyOnboardingStepsCompletedAt,
    metadata: z.never().nullish(), // NA for now
  })
  .nullable(); // Might be null for not needed or completed

export type CompanyOnboardingState = z.infer<typeof companyOnboardingState>;
