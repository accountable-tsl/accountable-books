import { describe, expect, it } from 'vitest';

import { assertAllowedOwnershipCombination } from '../ownership/ownership.validation.js';

const BILLING_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

describe('ownership.validation', () => {
  it('allows self_serve with billing_account software payer', () => {
    expect(() =>
      assertAllowedOwnershipCombination({
        billingAccountId: BILLING_ACCOUNT_ID,
        commercialMode: 'self_serve',
        clientBillingAccountId: null,
        softwarePayer: 'billing_account',
      }),
    ).not.toThrow();
  });

  it('rejects self_serve with client billing account set', () => {
    expect(() =>
      assertAllowedOwnershipCombination({
        billingAccountId: BILLING_ACCOUNT_ID,
        commercialMode: 'self_serve',
        clientBillingAccountId: CLIENT_ACCOUNT_ID,
        softwarePayer: 'billing_account',
      }),
    ).toThrow(/clientBillingAccountId must be null/);
  });

  it('rejects client_billing_account software payer in Phase 2', () => {
    expect(() =>
      assertAllowedOwnershipCombination({
        billingAccountId: BILLING_ACCOUNT_ID,
        commercialMode: 'firm_managed',
        clientBillingAccountId: null,
        softwarePayer: 'client_billing_account',
      }),
    ).toThrow(/softwarePayer must be billing_account/);
  });

  it('rejects client billing account equal to payer billing account', () => {
    expect(() =>
      assertAllowedOwnershipCombination({
        billingAccountId: BILLING_ACCOUNT_ID,
        commercialMode: 'firm_managed',
        clientBillingAccountId: BILLING_ACCOUNT_ID,
        softwarePayer: 'billing_account',
      }),
    ).toThrow(/must differ from billingAccountId/);
  });

  it('allows firm_managed with optional distinct client billing account', () => {
    expect(() =>
      assertAllowedOwnershipCombination({
        billingAccountId: BILLING_ACCOUNT_ID,
        commercialMode: 'firm_managed',
        clientBillingAccountId: CLIENT_ACCOUNT_ID,
        softwarePayer: 'billing_account',
      }),
    ).not.toThrow();
  });
});
