import { billing } from '@accountable-books/contracts/schema';
import { describe, expect, it } from 'vitest';

describe('billing catalog contracts', () => {
  it('accepts decimal-string minor-unit amounts', () => {
    const parsed = billing.billingCatalogPriceSummarySchema.safeParse({
      currencyCode: 'USD',
      billingInterval: 'month',
      unitAmountMinor: '14900',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects non-decimal minor-unit amounts', () => {
    const parsed = billing.billingCatalogPriceSummarySchema.safeParse({
      currencyCode: 'USD',
      billingInterval: 'month',
      unitAmountMinor: '149.00',
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts matching feature code and payload pairs', () => {
    const parsed = billing.billingCatalogFeatureSummarySchema.safeParse({
      featureCode: 'monthly_credit_allowance_units',
      featureValue: { units: 5 },
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects mismatched feature code and payload pairs', () => {
    const parsed = billing.billingCatalogFeatureSummarySchema.safeParse({
      featureCode: 'monthly_credit_allowance_units',
      featureValue: { tier: 'standard' },
    });

    expect(parsed.success).toBe(false);
  });
});
