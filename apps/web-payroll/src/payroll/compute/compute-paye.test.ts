// import { describe, it, expect } from 'vitest';
// import {
//   computePaye,
//   computeAnnualTaxFromAmounts,
// } from './compute-paye';

// /**
//  * Test suite for PAYE computation
//  *
//  * Tests cover:
//  * - Tax band calculations
//  * - Rent relief (20% of annual rent, capped at 500k)
//  * - YTD vs non-YTD flows
//  * - Edge cases (zero income, negative values, etc.)
//  */

// describe('computeAnnualTaxFromAmounts', () => {
//   it('should compute zero tax for income below first tax band (800k)', () => {
//     const tax = computeAnnualTaxFromAmounts(500_000, 0, 0);
//     expect(tax).toBe(0);
//   });

//   it('should compute tax correctly for income in first taxable band (800k-3M)', () => {
//     // Income: 1,000,000
//     // Taxable: 1,000,000 - 0 - 0 = 1,000,000
//     // Tax: (1,000,000 - 800,000) * 0.15 = 30,000
//     const tax = computeAnnualTaxFromAmounts(1_000_000, 0, 0);
//     expect(tax).toBe(30_000);
//   });

//   it('should compute tax correctly across multiple bands', () => {
//     // Income: 5,000,000
//     // Taxable: 5,000,000 - 0 - 0 = 5,000,000
//     // Tax breakdown:
//     //   - 0-800k: 0
//     //   - 800k-3M: (3,000,000 - 800,000) * 0.15 = 330,000
//     //   - 3M-12M: (5,000,000 - 3,000,000) * 0.18 = 360,000
//     // Total: 690,000
//     const tax = computeAnnualTaxFromAmounts(5_000_000, 0, 0);
//     expect(tax).toBe(690_000);
//   });

//   it('should apply allowable deductions correctly', () => {
//     // Income: 2,000,000
//     // Deductions: 200,000
//     // Taxable: 2,000,000 - 0 - 200,000 = 1,800,000
//     // Tax: (1,800,000 - 800,000) * 0.15 = 150,000
//     const tax = computeAnnualTaxFromAmounts(2_000_000, 200_000, 0);
//     expect(tax).toBe(150_000);
//   });

//   it('should apply rent relief correctly (20% of annual rent)', () => {
//     // Income: 2,000,000
//     // Annual rent: 1,000,000
//     // Rent relief: 1,000,000 * 0.2 = 200,000
//     // Taxable: 2,000,000 - 200,000 - 0 = 1,800,000
//     // Tax: (1,800,000 - 800,000) * 0.15 = 150,000
//     const tax = computeAnnualTaxFromAmounts(2_000_000, 0, 1_000_000);
//     expect(tax).toBe(150_000);
//   });

//   it('should cap rent relief at 500,000', () => {
//     // Income: 5,000,000
//     // Annual rent: 5,000,000 (would be 1M relief without cap)
//     // Rent relief: min(5,000,000 * 0.2, 500,000) = 500,000
//     // Taxable: 5,000,000 - 500,000 - 0 = 4,500,000
//     // Tax: 330,000 + (4,500,000 - 3,000,000) * 0.18 = 330,000 + 270,000 = 600,000
//     const tax = computeAnnualTaxFromAmounts(5_000_000, 0, 5_000_000);
//     expect(tax).toBe(600_000);
//   });

//   it('should handle combined deductions and rent relief', () => {
//     // Income: 3,000,000
//     // Deductions: 300,000
//     // Annual rent: 1,000,000
//     // Rent relief: 200,000
//     // Taxable: 3,000,000 - 200,000 - 300,000 = 2,500,000
//     // Tax: (2,500,000 - 800,000) * 0.15 = 255,000
//     const tax = computeAnnualTaxFromAmounts(3_000_000, 300_000, 1_000_000);
//     expect(tax).toBe(255_000);
//   });

//   it('should handle zero taxable income (deductions exceed gross)', () => {
//     // Income: 500,000
//     // Deductions: 1,000,000
//     // Taxable: max(500,000 - 0 - 1,000,000, 0) = 0
//     // Tax: 0
//     const tax = computeAnnualTaxFromAmounts(500_000, 1_000_000, 0);
//     expect(tax).toBe(0);
//   });

//   it('should handle very high income (top tax band)', () => {
//     // Income: 100,000,000
//     // Taxable: 100,000,000 - 0 - 0 = 100,000,000
//     // Tax breakdown:
//     //   - 0-800k: 0
//     //   - 800k-3M: 330,000
//     //   - 3M-12M: 1,620,000
//     //   - 12M-25M: 2,730,000
//     //   - 25M-50M: 5,750,000
//     //   - 50M+: (100,000,000 - 50,000,000) * 0.25 = 12,500,000
//     // Total: 22,930,000
//     const tax = computeAnnualTaxFromAmounts(100_000_000, 0, 0);
//     expect(tax).toBe(22_930_000);
//   });

//   it('should compute zero tax when annual gross is exactly at minimum wage (840k)', () => {
//     // Gross: 840,000 (minimum wage)
//     // Even though taxable income would cross the 800k band, minimum wage is tax-exempt.
//     const tax = computeAnnualTaxFromAmounts(840_000, 0, 0);
//     expect(tax).toBe(0);
//   });

//   it('should compute zero tax when annual gross is below minimum wage', () => {
//     const tax = computeAnnualTaxFromAmounts(700_000, 0, 0);
//     expect(tax).toBe(0);
//   });
// });

// describe('computePaye - Non-YTD Flow', () => {
//   it('should compute monthly PAYE from annualized values', () => {
//     // Income: 2,000,000
//     // Tax: 150,000 (from test above)
//     // Monthly PAYE: 150,000 / 12 = 12,500
//     const result = computePaye({
//       annualTaxableGross: 2_000_000,
//       annualAllowableDeductions: 0,
//       annualRent: 0,
//       enableYtd: false,
//     });

//     expect(result.paye).toBe(12_500);
//     expect(result.annualTax).toBe(150_000);
//     expect(result.annualTaxableIncome).toBe(1_200_000);
//   });

//   it('should handle rent relief in non-YTD flow', () => {
//     const result = computePaye({
//       annualTaxableGross: 3_000_000,
//       annualAllowableDeductions: 0,
//       annualRent: 1_000_000,
//       enableYtd: false,
//       enableRentRelief: true,
//     });

//     // Rent relief: 200,000
//     // Taxable: 2,800,000
//     // Tax: (2,800,000 - 800,000) * 0.15 = 300,000
//     // Monthly: 25,000
//     expect(result.annualRentRelief).toBe(200_000);
//     expect(result.annualTax).toBe(300_000);
//     expect(result.paye).toBe(25_000);
//   });

//   it('should allow disabling rent relief', () => {
//     const result = computePaye({
//       annualTaxableGross: 3_000_000,
//       annualAllowableDeductions: 0,
//       annualRent: 1_000_000,
//       enableYtd: false,
//       enableRentRelief: false,
//     });

//     expect(result.annualRentRelief).toBe(0);
//     // Taxable: 3,000,000
//     // Tax: (3,000,000 - 800,000) * 0.15 = 330,000
//     expect(result.annualTax).toBe(330_000);
//   });

//   it('should return zero PAYE for non-YTD flow when annual gross is at minimum wage', () => {
//     const result = computePaye({
//       annualTaxableGross: 840_000,
//       annualAllowableDeductions: 0,
//       annualRent: 0,
//       enableYtd: false,
//     });

//     expect(result.annualTax).toBe(0);
//     expect(result.paye).toBe(0);
//   });
// });

// describe('computePaye - YTD Flow', () => {
//   it('should compute PAYE using YTD method', () => {
//     // Employee worked 6 months (0.5 year)
//     // Annual taxable gross: 2,000,000
//     // Annual tax: 150,000
//     // Tax due YTD: 150,000 * 0.5 = 75,000
//     // Tax withheld YTD (before this month): 60,000
//     // PAYE this month: 75,000 - 60,000 = 15,000
//     const result = computePaye({
//       annualTaxableGross: 2_000_000,
//       annualAllowableDeductions: 0,
//       annualRent: 0,
//       enableYtd: true,
//       workedMonthUnits: 6,
//       taxWithheldYtd: 60_000,
//     });

//     expect(result.annualTax).toBe(150_000);
//     expect(result.taxDueYtd).toBe(75_000);
//     expect(result.taxWithheldYtd).toBe(60_000);
//     expect(result.paye).toBe(15_000);
//   });

//   it('should handle first month of employment (no prior tax withheld)', () => {
//     const result = computePaye({
//       annualTaxableGross: 2_000_000,
//       annualAllowableDeductions: 0,
//       annualRent: 0,
//       enableYtd: true,
//       workedMonthUnits: 1,
//       taxWithheldYtd: 0,
//     });

//     // Tax due YTD: 150,000 * (1/12) = 12,500
//     expect(result.taxDueYtd).toBe(12_500);
//     expect(result.paye).toBe(12_500);
//   });

//   it('should handle mid-year salary increase', () => {
//     // Employee worked 6 months at lower salary, now gets raise
//     // Previous YTD: 60,000 tax withheld
//     // New annual taxable gross: 3,000,000 (up from 2,000,000)
//     // New annual tax: 330,000
//     // Tax due YTD: 330,000 * 0.5 = 165,000
//     // PAYE this month: 165,000 - 60,000 = 105,000
//     const result = computePaye({
//       annualTaxableGross: 3_000_000,
//       annualAllowableDeductions: 0,
//       annualRent: 0,
//       enableYtd: true,
//       workedMonthUnits: 6,
//       taxWithheldYtd: 60_000,
//     });

//     expect(result.taxDueYtd).toBe(165_000);
//     expect(result.paye).toBe(105_000);
//   });

//   it('should return undefined PAYE if workedMonthUnits is missing', () => {
//     const result = computePaye({
//       annualTaxableGross: 2_000_000,
//       annualAllowableDeductions: 0,
//       annualRent: 0,
//       enableYtd: true,
//       // workedMonthUnits missing
//       taxWithheldYtd: 0,
//     });

//     expect(result.paye).toBeUndefined();
//     expect(result.annualTax).toBe(150_000); // Still computes annual tax
//   });

//   it('should return undefined PAYE if taxWithheldYtd is missing', () => {
//     const result = computePaye({
//       annualTaxableGross: 2_000_000,
//       annualAllowableDeductions: 0,
//       annualRent: 0,
//       enableYtd: true,
//       workedMonthUnits: 6,
//       // taxWithheldYtd missing
//     });

//     expect(result.paye).toBeUndefined();
//   });

//   it('should return undefined PAYE if workedMonthUnits is zero', () => {
//     const result = computePaye({
//       annualTaxableGross: 2_000_000,
//       annualAllowableDeductions: 0,
//       annualRent: 0,
//       enableYtd: true,
//       workedMonthUnits: 0,
//       taxWithheldYtd: 0,
//     });

//     expect(result.paye).toBeUndefined();
//   });

//   it('should handle negative PAYE (over-withheld) by returning zero', () => {
//     // Tax due YTD: 50,000
//     // Tax withheld YTD: 60,000 (over-withheld)
//     // PAYE should be 0 (not negative)
//     const result = computePaye({
//       annualTaxableGross: 1_500_000,
//       annualAllowableDeductions: 0,
//       annualRent: 0,
//       enableYtd: true,
//       workedMonthUnits: 6,
//       taxWithheldYtd: 60_000,
//     });

//     // Annual tax: (1,500,000 - 800,000) * 0.15 = 105,000
//     // Tax due YTD: 105,000 * 0.5 = 52,500
//     // PAYE: max(52,500 - 60,000, 0) = 0
//     expect(result.taxDueYtd).toBe(52_500);
//     expect(result.paye).toBe(0);
//   });

//   it('should handle full year YTD (12 months)', () => {
//     const result = computePaye({
//       annualTaxableGross: 2_000_000,
//       annualAllowableDeductions: 0,
//       annualRent: 0,
//       enableYtd: true,
//       workedMonthUnits: 12,
//       taxWithheldYtd: 140_000,
//     });

//     // Tax due YTD: 150,000 * 1.0 = 150,000
//     // PAYE: 150,000 - 140,000 = 10,000
//     expect(result.taxDueYtd).toBe(150_000);
//     expect(result.paye).toBe(10_000);
//   });

//   it('should return zero PAYE in YTD flow when annual gross is at minimum wage', () => {
//     const result = computePaye({
//       annualTaxableGross: 840_000,
//       annualAllowableDeductions: 0,
//       annualRent: 0,
//       enableYtd: true,
//       workedMonthUnits: 6,
//       taxWithheldYtd: 0,
//     });

//     expect(result.annualTax).toBe(0);
//     expect(result.taxDueYtd).toBe(0);
//     expect(result.paye).toBe(0);
//   });
// });

// describe('computePaye - Edge Cases', () => {
//   it('should handle zero income', () => {
//     const result = computePaye({
//       annualTaxableGross: 0,
//       annualAllowableDeductions: 0,
//       annualRent: 0,
//       enableYtd: false,
//     });

//     expect(result.paye).toBe(0);
//     expect(result.annualTax).toBe(0);
//     expect(result.annualTaxableIncome).toBe(0);
//   });

//   it('should handle very high deductions (negative taxable income)', () => {
//     const result = computePaye({
//       annualTaxableGross: 500_000,
//       annualAllowableDeductions: 1_000_000,
//       annualRent: 0,
//       enableYtd: false,
//     });

//     // Taxable income becomes 0 (not negative)
//     expect(result.annualTaxableIncome).toBe(0);
//     expect(result.annualTax).toBe(0);
//     expect(result.paye).toBe(0);
//   });

//   it('should handle fractional month units', () => {
//     // Employee worked 1.5 months
//     const result = computePaye({
//       annualTaxableGross: 2_000_000,
//       annualAllowableDeductions: 0,
//       annualRent: 0,
//       enableYtd: true,
//       workedMonthUnits: 1.5,
//       taxWithheldYtd: 0,
//     });

//     // Tax due YTD: 150,000 * (1.5/12) = 18,750
//     expect(result.taxDueYtd).toBe(18_750);
//     expect(result.paye).toBe(18_750);
//   });
// });
