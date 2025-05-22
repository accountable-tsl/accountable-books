import { UserOnboardingStatus } from "@/domains/user/types";
import { LucideIcon } from "lucide-react";
import { z } from "zod";

export const phoneNumberFormSchema = z.object({
  phone: z.object({
    phoneNumber: z.string().min(1, "Phone number is required"),
    countryCode: z.string(),
    completeNumber: z.string().min(1, "Phone number is required"),
  }),
});

export type PhoneNumberForm = z.infer<typeof phoneNumberFormSchema>;

export type VerifyEmailProps = {
  email: string;
};

export const onboardingSteps = z.enum([
  "verifyEmail",
  "companyVitals",
  "companyDetails",
  "addBankAccount",
  "miscellaneous",
]);
export type OnboardingSteps = z.infer<typeof onboardingSteps>;

export type OnboardingSideBarSteps = {
  [K in OnboardingSteps]: {
    icon: LucideIcon;
    title: string;
    description: string;
    key: OnboardingSteps;
  };
};

export type Contact = {
  phoneNumber: string;
  countryCode: string;
  completeNumber: string;
};
