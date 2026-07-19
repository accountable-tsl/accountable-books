import { z } from 'zod';

export const businessOrPersonalAccountSchema = z.enum(['business', 'personal']);
export type BusinessOrPersonalAccount = z.infer<
  typeof businessOrPersonalAccountSchema
>;

export const connectedAccountLinkageSchema = z.enum(['new', 'existing']);
export type ConnectedAccountLinkage = z.infer<
  typeof connectedAccountLinkageSchema
>;

export const connectedAccountSchema = z.object({
  id: z.uuid(),
  feedId: z.uuid(),
  displayName: z.string(),
  mask: z.string(),
  currencyCode: z.string().length(3),
  businessOrPersonal: businessOrPersonalAccountSchema,
  /** Durable bank account created this connect vs rematched/resumed. */
  linkage: connectedAccountLinkageSchema,
});
export type ConnectedAccount = z.infer<typeof connectedAccountSchema>;

export const connectedBankSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  logoUrl: z.string().nullable(),
});
export type ConnectedBank = z.infer<typeof connectedBankSchema>;

export const connectAccountsOutcomeSchema = z.enum([
  'connected',
  'reauthorized',
  'replaced',
  'needs_confirmation',
]);
export type ConnectAccountsOutcome = z.infer<
  typeof connectAccountsOutcomeSchema
>;

export const connectReplacementMappingSchema = z.object({
  oldFeedId: z.uuid(),
  oldConnectionId: z.uuid(),
  bankAccountId: z.uuid(),
  providerAccountId: z.string().min(1),
});

export const connectAccountsConfirmationSchema = z.object({
  reason: z.string().min(1),
  oldConnectionIds: z.array(z.uuid()),
  mappings: z.array(connectReplacementMappingSchema),
});

export const connectAccountsResponseSchema = z.object({
  bank: connectedBankSchema,
  accounts: z.array(connectedAccountSchema),
  outcome: connectAccountsOutcomeSchema.optional(),
  confirmation: connectAccountsConfirmationSchema.optional(),
});
export type ConnectAccountsResponse = z.infer<
  typeof connectAccountsResponseSchema
>;

export const connectAccountsRequestSchema = z.object({
  providerKey: z.string().min(1),
  countryCode: z.string().min(2).max(2),
  publicToken: z.string().min(1),
  companyId: z.uuid(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  confirmReplacement: z.boolean().optional(),
});
export type ConnectAccountsRequest = z.infer<
  typeof connectAccountsRequestSchema
>;
