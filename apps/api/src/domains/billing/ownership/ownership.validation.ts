import type {
  BillingCommercialMode,
  BillingSoftwarePayer,
} from '../billing.types.js';

export type OwnershipCombinationInput = {
  billingAccountId: string;
  commercialMode: BillingCommercialMode;
  clientBillingAccountId: string | null | undefined;
  softwarePayer: BillingSoftwarePayer;
};

/**
 * Phase 2 allowed ownership field combinations.
 * Extend in Phase 8 when client sell-price may set software_payer = client_billing_account.
 */
export function assertAllowedOwnershipCombination(
  input: OwnershipCombinationInput,
): void {
  const clientBillingAccountId = input.clientBillingAccountId ?? null;

  if (
    clientBillingAccountId !== null &&
    clientBillingAccountId === input.billingAccountId
  ) {
    throw new Error(
      'clientBillingAccountId must differ from billingAccountId when set',
    );
  }

  if (input.softwarePayer !== 'billing_account') {
    throw new Error(
      `softwarePayer must be billing_account in Phase 2 (got ${input.softwarePayer})`,
    );
  }

  switch (input.commercialMode) {
    case 'self_serve':
    case 'firm_internal':
      if (clientBillingAccountId !== null) {
        throw new Error(
          `clientBillingAccountId must be null for commercial_mode=${input.commercialMode}`,
        );
      }
      return;

    case 'firm_managed':
      return;

    default: {
      const _exhaustive: never = input.commercialMode;
      throw new Error(`Unknown commercial_mode: ${_exhaustive}`);
    }
  }
}
