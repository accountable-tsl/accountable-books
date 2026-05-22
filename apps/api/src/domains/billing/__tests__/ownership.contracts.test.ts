import { billing } from '@accountable-books/contracts/schema';
import { describe, expect, it } from 'vitest';

describe('billing ownership contracts', () => {
  it('parses workspaceBillingContextSchema', () => {
    const parsed = billing.workspaceBillingContextSchema.safeParse({
      workspaceCompanyId: 'ws-1',
      ownershipId: 'own-1',
      billingAccountId: 'ba-1',
      clientBillingAccountId: null,
      commercialMode: 'self_serve',
      softwarePayer: 'billing_account',
      isFirmInternalWorkspace: false,
      effectiveAt: '2026-01-01T00:00:00.000Z',
      endedAt: null,
      billingAccount: {
        id: 'ba-1',
        ownerCompanyId: 'co-1',
        ownerType: 'business',
        invoiceCurrencyCode: 'USD',
        status: 'active',
      },
      clientBillingAccount: null,
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects invalid softwarePayer', () => {
    const parsed = billing.workspaceBillingContextSchema.safeParse({
      workspaceCompanyId: 'ws-1',
      ownershipId: 'own-1',
      billingAccountId: 'ba-1',
      clientBillingAccountId: null,
      commercialMode: 'self_serve',
      softwarePayer: 'firm',
      isFirmInternalWorkspace: false,
      effectiveAt: '2026-01-01T00:00:00.000Z',
      endedAt: null,
      billingAccount: {
        id: 'ba-1',
        ownerCompanyId: 'co-1',
        ownerType: 'business',
        invoiceCurrencyCode: 'USD',
        status: 'active',
      },
      clientBillingAccount: null,
    });

    expect(parsed.success).toBe(false);
  });
});
