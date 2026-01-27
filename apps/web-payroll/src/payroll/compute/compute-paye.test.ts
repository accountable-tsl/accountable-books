import { describe, expect, it } from 'vitest';

import { computeAnnualTaxFromAmounts, computePaye } from './compute-paye';

/**
 * Test suite for PAYE computation
 *
 * Tests cover:
 * - Basic tax band calculations
 * - Non-YTD flow (simple monthly PAYE)
 */

describe('computeAnnualTaxFromAmounts', () => {
  it('should compute zero tax for income below first tax band (800k)', () => {
    const tax = computeAnnualTaxFromAmounts(500_000, 0, 0);
    expect(tax).toBe(0);
  });

  it('should compute tax correctly for income in first taxable band (800k-3M)', () => {
    // Income: 1,000,000
    // Taxable: 1,000,000 - 0 - 0 = 1,000,000
    // Tax: (1,000,000 - 800,000) * 0.15 = 30,000
    const tax = computeAnnualTaxFromAmounts(1_000_000, 0, 0);
    expect(tax).toBe(30_000);
  });
});

describe('computePaye - Non-YTD Flow', () => {
  it('should compute monthly PAYE from annualized values', () => {
    // Income: 2,000,000 annual
    // Taxable: 2,000,000 - 0 - 0 = 2,000,000
    // Tax: (2,000,000 - 800,000) * 0.15 = 180,000
    // Monthly PAYE: 180,000 / 12 = 15,000
    const result = computePaye({
      annualTaxableGross: 2_000_000,
      annualAllowableDeductions: 0,
      annualRent: 0,
      enableYtd: false,
    });

    expect(result.paye).toBe(15_000);
    expect(result.annualTax).toBe(180_000);
  });
});
