import MonoConnect from '@mono.co/connect.js';
import { useEffect, useRef } from 'react';
import z from 'zod';

import { WidgetManualFallback } from './widget-manual-fallback';

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
  email: z.email(),
  identity: identitySchema.optional(),
});

export const monoConnectCustomerSchema = z.union([
  monoCustomerWithId,
  monoCustomerWithNameEmail,
]);

export type MonoConnectCustomer = z.infer<typeof monoConnectCustomerSchema>;

interface MonoWidgetProps {
  onClose?: () => void;
  onLoad?: () => void;
  onSuccess?: (code: string) => void;
  customer?: MonoConnectCustomer;
  autoOpen?: boolean;
}

export function MonoWidget({
  onClose,
  onLoad,
  onSuccess,
  customer,
  autoOpen = true,
}: MonoWidgetProps) {
  const publicKey = import.meta.env.VITE_MONO_PUBLIC_KEY as string | undefined;
  const monoRef = useRef<MonoConnect | null>(null);
  const successCalledRef = useRef(false);
  const openedOnceRef = useRef(false);

  console.log('customer', customer, 'publicKey', publicKey);

  // init once
  useEffect(() => {
    if (!publicKey) {
      console.error('VITE_MONO_PUBLIC_KEY is missing');
      return;
    }
    if (typeof window === 'undefined') return; // SSR guard
    if (monoRef.current) return;

    const instance = new MonoConnect({
      key: publicKey,
      data: customer ? { customer } : undefined,
      onClose: () => onClose?.(),
      onLoad: () => onLoad?.(),
      onSuccess: ({ code }: { code: string }) => {
        if (successCalledRef.current) return;
        successCalledRef.current = true;
        onSuccess?.(code);
      },
    });

    monoRef.current = instance;
    instance.setup();

    // open once after setup if requested
    if (autoOpen && !openedOnceRef.current) {
      openedOnceRef.current = true;
      instance.open();
    }

    return () => {
      // no documented destroy API; just drop the ref
      monoRef.current = null;
    };
  }, [publicKey, autoOpen, customer, onClose, onLoad, onSuccess]);

  // Expose manual open method
  const open = () => monoRef.current?.open();

  // return (
  //   <div className="space-y-4">
  //     <div className="text-center">
  //       <h3 className="text-lg font-semibold mb-2">
  //         Connect Your Bank Account
  //       </h3>
  //       <p className="text-muted-foreground text-sm mb-4">
  //         Securely link your Nigerian bank account to import transactions
  //         automatically.
  //       </p>
  //     </div>

  //     <Button onClick={open} className="w-full" size="lg">
  //       Connect Bank Account
  //     </Button>

  //     <div className="text-xs text-muted-foreground text-center">
  //       Your credentials are encrypted and secure
  //     </div>
  //   </div>
  // );
  return <WidgetManualFallback onOpenClick={open} />;
}
