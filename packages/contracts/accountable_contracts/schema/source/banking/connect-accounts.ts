import { z } from 'zod';

export const businessOrPersonalAccountSchema = z.enum(['business', 'personal']);
export type BusinessOrPersonalAccount = z.infer<
  typeof businessOrPersonalAccountSchema
>;

export const connectedAccountSchema = z.object({
  id: z.uuid(),
  feedId: z.uuid(),
  displayName: z.string(),
  mask: z.string(),
  currencyCode: z.string().length(3),
  businessOrPersonal: businessOrPersonalAccountSchema,
});
export type ConnectedAccount = z.infer<typeof connectedAccountSchema>;

export const connectedBankSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  logoUrl: z.string().nullable(),
});
export type ConnectedBank = z.infer<typeof connectedBankSchema>;

export const connectAccountsResponseSchema = z.object({
  bank: connectedBankSchema,
  accounts: z.array(connectedAccountSchema),
});
export type ConnectAccountsResponse = z.infer<
  typeof connectAccountsResponseSchema
>;
