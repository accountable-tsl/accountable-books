import { z } from 'zod';

export interface MonoWidgetProps {
  open: boolean;
  onClose?: () => void;
  onLoad?: () => void;
  onSuccess?: (code: string) => Promise<void>;
  data: MonoConnectCustomer;
}

const identitySchema = z.object({
  type: z.string(),
  number: z.string(),
});

const monoCustomerWithId = z.object({
  id: z.string(),
  name: z.never().optional(),
  email: z.never().optional(),
  identity: identitySchema.optional(),
});

const monoCustomerWithNameEmail = z.object({
  id: z.never().optional(),
  name: z.string(),
  email: z.string().email(),
  identity: identitySchema.optional(),
});

export const monoConnectCustomerSchema = z.union([monoCustomerWithId, monoCustomerWithNameEmail]);

export type MonoConnectCustomer = z.infer<typeof monoConnectCustomerSchema>;
