// import { describe, it, expect, vi, beforeEach } from 'vitest';
// import { computeRun } from './compute-run';
// import type { PayrollRun, PayrollRunItem } from '../domain';

// // Mock dependencies
// vi.mock('./extract-ytd', () => ({
//   loadFinalizedRunHistory: vi.fn(),
//   extractYtdData: vi.fn(),
// }));

// vi.mock('./compute-paye', () => ({
//   computePaye: vi.fn(),
// }));

// import { loadFinalizedRunHistory, extractYtdData } from './extract-ytd';
// import { computePaye } from './compute-paye';

// /**
//  * Test suite for payroll run computation
//  *
//  * Tests cover:
//  * - Full payroll computation flow
//  * - YTD vs non-YTD flows
//  * - Statutory deductions calculation
//  * - Allowable deductions tracking
//  * - Exempt income handling
//  * - Tax breakdown population
//  * - Edge cases
//  */

// describe('computeRunItem', () => {
//   beforeEach(() => {
//     vi.clearAllMocks();
//   });

//   const createMockRunItem = (overrides?: Partial<PayrollRunItem>): PayrollRunItem => {
//     return {
//       id: 'item-1',
//       employeeSnapshot: {
//         fullName: 'John Doe',
//         taxId: 'TAX123',
//         identity: {
//           id: 'emp-1',
//           type: 'tax_id',
//         },
//       },
//       payProfileSnapshot: {
//         compensationHistory: [
//           {
//             periodStart: '2024-01-01',
//             periodEnd: null,
//             annualGross: '2400000', // 2.4M annual = 200k monthly
//           },
//         ],
//       },
//       edits: {},
//       ...overrides,
//     };
//   };

//   const createMockRun = (overrides?: Partial<PayrollRun>): PayrollRun => {
//     return {
//       id: 'run-2024-03',
//       companyId: 'company-1',
//       companyName: 'Test Company',
//       periodMonth: 3,
//       periodYear: 2024,
//       status: 'draft',
//       items: [],
//       settings: {
//         pension: {
//           enabled: true,
//           employeeRate: 0.08,
//           employerRate: 0.1,
//         },
//         nhf: {
//           enabled: true,
//           employeeRate: 0.025,
//         },
//         nhis: {
//           enabled: true,
//           employeeRate: 0.015,
//           employerRate: 0.015,
//         },
//       },
//       createdAt: '2024-03-01T00:00:00Z',
//       updatedAt: '2024-03-01T00:00:00Z',
//       ...overrides,
//     };
//   };

//   it('should compute payroll for employee with basic salary', async () => {
//     const runItem = createMockRunItem();
//     const run = createMockRun({
//       items: [runItem],
//     });

//     // Mock non-YTD flow (no YTD data)
//     vi.mocked(loadFinalizedRunHistory).mockResolvedValue([]);
//     vi.mocked(extractYtdData).mockReturnValue(undefined);
//     vi.mocked(computePaye).mockReturnValue({
//       paye: 12500, // 150k annual / 12 = 12.5k monthly
//       annualRent: 0,
//       annualRentRelief: 0,
//       annualTaxableIncome: 1200000,
//       annualTax: 150000,
//     });

//     const result = await computeRun(run);

//     expect(result).toBeDefined();
//     expect(result.items).toHaveLength(1);
//     expect(result.items[0].paye).toBe('12500.00');
//     expect(result.items[0].gross).toBe('200000.00'); // 2.4M / 12
//     expect(computePaye).toHaveBeenCalled();
//   });

//   it('should use YTD flow when YTD data is available', async () => {
//     const runItem = createMockRunItem();
//     const run = createMockRun({
//       items: [runItem],
//     });

//     // Mock YTD flow
//     const finalizedRuns: PayrollRun[] = [];
//     vi.mocked(loadFinalizedRunHistory).mockResolvedValue(finalizedRuns);
//     vi.mocked(extractYtdData).mockReturnValue({
//       projectedAnnualGross: 2400000,
//       projectedAnnualAllowableDeductions: 0,
//       workedMonthUnits: 3,
//       taxWithheldYtd: 0,
//       exemptIncome: {
//         deathInjuryCompensation: 0,
//         redundancyPayment: 0,
//         lossOfEmployment: {
//           total: 0,
//           exempt: 0,
//           taxable: 0,
//         },
//       },
//     });
//     vi.mocked(computePaye).mockReturnValue({
//       paye: 12500,
//       annualRent: 0,
//       annualRentRelief: 0,
//       annualTaxableIncome: 1200000,
//       annualTax: 150000,
//       taxDueYtd: 37500,
//       taxWithheldYtd: 0,
//     });

//     const result = await computeRun(run);

//     expect(result).toBeDefined();
//     expect(result.items).toHaveLength(1);
//     expect(computePaye).toHaveBeenCalledWith(
//       expect.objectContaining({
//         annualTaxableGross: 2400000,
//         enableYtd: true,
//         workedMonthUnits: 3,
//         taxWithheldYtd: 0,
//       }),
//     );
//   });

//   it('should calculate statutory deductions correctly', async () => {
//     const runItem = createMockRunItem();
//     const run = createMockRun({
//       items: [runItem],
//       settings: {
//         pension: {
//           enabled: true,
//           employeeRate: 0.08, // 8%
//           employerRate: 0.1, // 10%
//         },
//         nhf: {
//           enabled: true,
//           employeeRate: 0.025, // 2.5%
//         },
//         nhis: {
//           enabled: true,
//           employeeRate: 0.015, // 1.5%
//           employerRate: 0.015, // 1.5%
//         },
//       },
//     });

//     vi.mocked(loadFinalizedRunHistory).mockResolvedValue([]);
//     vi.mocked(extractYtdData).mockReturnValue(undefined);
//     vi.mocked(computePaye).mockReturnValue({
//       paye: 12500,
//       annualRent: 0,
//       annualRentRelief: 0,
//       annualTaxableIncome: 1200000,
//       annualTax: 150000,
//     });

//     const result = await computeRun(run);

//     expect(result).toBeDefined();
//     expect(result.items).toHaveLength(1);
//     const item = result.items[0];
//     // Annual gross: 2.4M
//     // Basic: 2.4M (100% basic, no breakdown)
//     // Pension base: 2.4M (basic + housing + transport)
//     // Employee pension: 2.4M * 0.08 = 192k annual = 16k monthly
//     expect(parseFloat(item.deductions.employeePension)).toBeCloseTo(16000, 0);
//     // NHF: 2.4M * 0.025 = 60k annual = 5k monthly
//     expect(parseFloat(item.deductions.employeeNhf)).toBeCloseTo(5000, 0);
//     // NHIS: 2.4M * 0.015 = 36k annual = 3k monthly
//     expect(parseFloat(item.deductions.employeeNhis)).toBeCloseTo(3000, 0);
//   });

//   it('should track allowable deductions breakdown', async () => {
//     const runItem = createMockRunItem({
//       payProfileSnapshot: {
//         compensationHistory: [
//           {
//             periodStart: '2024-01-01',
//             periodEnd: null,
//             annualGross: '2400000',
//           },
//         ],
//         recurringDeductions: [
//           {
//             fromMonth: '2024-01-01',
//             toMonth: null,
//             amount: '10000',
//             taxTreatment: 'pension_voluntary',
//             description: 'Voluntary pension',
//           },
//         ],
//       },
//       edits: {
//         oneOffDeductions: [
//           {
//             amount: '50000',
//             taxTreatment: 'pension_voluntary',
//             description: 'One-time pension',
//           },
//         ],
//       },
//     });
//     const run = createMockRun({
//       items: [runItem],
//     });

//     vi.mocked(loadFinalizedRunHistory).mockResolvedValue([]);
//     vi.mocked(extractYtdData).mockReturnValue(undefined);
//     vi.mocked(computePaye).mockReturnValue({
//       paye: 12500,
//       annualRent: 0,
//       annualRentRelief: 0,
//       annualTaxableIncome: 1200000,
//       annualTax: 150000,
//     });

//     const result = await computeRun(run);

//     expect(result).toBeDefined();
//     expect(result.items).toHaveLength(1);
//     expect(result.items[0].taxBreakdown).toBeDefined();
//     // Recurring: 10k/month
//     expect(parseFloat(result.items[0].taxBreakdown!.allowableDeductions.voluntaryRecurring.pension)).toBe(10000);
//     // One-off: 50k
//     expect(parseFloat(result.items[0].taxBreakdown!.allowableDeductions.voluntaryOneOff.pension)).toBe(50000);
//   });

//   it('should handle exempt income correctly', async () => {
//     const runItem = createMockRunItem({
//       edits: {
//         oneOffAllowances: [
//           {
//             amount: '1000000',
//             taxTreatment: 'death_injury_compensation',
//             description: 'Death benefit',
//           },
//           {
//             amount: '30000000', // 30M loss of employment (below 50M cap)
//             taxTreatment: 'loss_of_employment_benefit',
//             description: 'Severance',
//           },
//         ],
//       },
//     });
//     const run = createMockRun();

//     vi.mocked(loadFinalizedRunHistory).mockResolvedValue([]);
//     vi.mocked(extractYtdData).mockReturnValue({
//       projectedAnnualGross: 2400000,
//       projectedAnnualAllowableDeductions: 0,
//       workedMonthUnits: 1,
//       taxWithheldYtd: 0,
//       exemptIncome: {
//         deathInjuryCompensation: 1000000,
//         redundancyPayment: 0,
//         lossOfEmployment: {
//           total: 30000000,
//           exempt: 30000000,
//           taxable: 0,
//         },
//       },
//     });
//     vi.mocked(computePaye).mockReturnValue({
//       paye: 12500,
//       annualRent: 0,
//       annualRentRelief: 0,
//       annualTaxableIncome: 1200000,
//       annualTax: 150000,
//     });

//     const result = await computeRun(run);

//     expect(result).toBeDefined();
//     expect(result.items).toHaveLength(1);
//     expect(result.items[0].taxBreakdown).toBeDefined();
//     expect(result.items[0].taxBreakdown!.exemptIncome.deathInjuryCompensation).toBe('1000000.00');
//     expect(result.items[0].taxBreakdown!.exemptIncome.lossOfEmployment.total).toBe('30000000.00');
//     expect(result.items[0].taxBreakdown!.exemptIncome.lossOfEmployment.exempt).toBe('30000000.00');
//     expect(result.items[0].taxBreakdown!.exemptIncome.lossOfEmployment.taxable).toBe('0.00');
//   });

//   it('should handle loss of employment cap correctly', async () => {
//     const runItem = createMockRunItem({
//       edits: {
//         oneOffAllowances: [
//           {
//             amount: '60000000', // 60M loss of employment (exceeds 50M cap)
//             taxTreatment: 'loss_of_employment_benefit',
//             description: 'Severance',
//           },
//         ],
//       },
//     });
//     const run = createMockRun({
//       items: [runItem],
//     });

//     vi.mocked(loadFinalizedRunHistory).mockResolvedValue([]);
//     vi.mocked(extractYtdData).mockReturnValue({
//       projectedAnnualGross: 2400000,
//       projectedAnnualAllowableDeductions: 0,
//       workedMonthUnits: 1,
//       taxWithheldYtd: 0,
//       exemptIncome: {
//         deathInjuryCompensation: 0,
//         redundancyPayment: 0,
//         lossOfEmployment: {
//           total: 60000000,
//           exempt: 50000000, // Capped at 50M
//           taxable: 10000000, // Excess is taxable
//         },
//       },
//     });
//     vi.mocked(computePaye).mockReturnValue({
//       paye: 12500,
//       annualRent: 0,
//       annualRentRelief: 0,
//       annualTaxableIncome: 1200000,
//       annualTax: 150000,
//     });

//     const result = await computeRun(run);

//     expect(result).toBeDefined();
//     expect(result.items).toHaveLength(1);
//     expect(result.items[0].taxBreakdown).toBeDefined();
//     expect(result.items[0].taxBreakdown!.exemptIncome.lossOfEmployment.total).toBe('60000000.00');
//     expect(result.items[0].taxBreakdown!.exemptIncome.lossOfEmployment.exempt).toBe('50000000.00');
//     expect(result.items[0].taxBreakdown!.exemptIncome.lossOfEmployment.taxable).toBe('10000000.00');
//   });

//   it('should calculate rent relief correctly', async () => {
//     const runItem = createMockRunItem({
//       payProfileSnapshot: {
//         compensationHistory: [
//           {
//             periodStart: '2024-01-01',
//             periodEnd: null,
//             annualGross: '2400000',
//           },
//         ],
//         rentHistory: [
//           {
//             fromMonth: '2024-01-01',
//             toMonth: '2024-12-31',
//             rent: '12000000', // 1M per month * 12 = 12M annual
//           },
//         ],
//       },
//     });
//     const run = createMockRun({
//       items: [runItem],
//       settings: {
//         enableRentRelief: true,
//       },
//     });

//     vi.mocked(loadFinalizedRunHistory).mockResolvedValue([]);
//     vi.mocked(extractYtdData).mockReturnValue(undefined);
//     vi.mocked(computePaye).mockReturnValue({
//       paye: 12500,
//       annualRent: 12000000, // 1M/month * 12
//       annualRentRelief: 500000, // 20% of 12M, but capped at 500k
//       annualTaxableIncome: 1000000,
//       annualTax: 150000,
//     });

//     const result = await computeRun(run);

//     expect(result).toBeDefined();
//     expect(result.items).toHaveLength(1);
//     expect(result.items[0].taxBreakdown).toBeDefined();
//     // Rent relief should be capped at 500k
//     expect(parseFloat(result.items[0].taxBreakdown!.rentRelief.annualRentRelief)).toBe(500000);
//   });

//   it('should populate tax breakdown with all required fields', async () => {
//     const runItem = createMockRunItem();
//     const run = createMockRun();

//     vi.mocked(loadFinalizedRunHistory).mockResolvedValue([]);
//     vi.mocked(extractYtdData).mockReturnValue(undefined);
//     vi.mocked(computePaye).mockReturnValue({
//       paye: 12500,
//       annualRent: 0,
//       annualRentRelief: 0,
//       annualTaxableIncome: 1200000,
//       annualTax: 150000,
//     });

//     const result = await computeRun(run);

//     expect(result).toBeDefined();
//     expect(result.items).toHaveLength(1);
//     expect(result.items[0].taxBreakdown).toBeDefined();
//     const breakdown = result.items[0].taxBreakdown!;

//     // Check all required fields exist
//     expect(breakdown.ytdData).toBeDefined();
//     expect(breakdown.exemptIncome).toBeDefined();
//     expect(breakdown.allowableDeductions).toBeDefined();
//     expect(breakdown.rentRelief).toBeDefined();
//     expect(breakdown.employment).toBeDefined();
//     expect(breakdown.taxComputation).toBeDefined();

//     // Check tax computation fields
//     expect(breakdown.taxComputation.annualTaxableIncome).toBe('1200000.00');
//     expect(breakdown.taxComputation.annualTax).toBe('150000.00');
//     expect(breakdown.taxComputation.monthlyPaye).toBe('12500.00');
//   });

//   it('should fall back to non-YTD if YTD computation fails', async () => {
//     const runItem = createMockRunItem();
//     const run = createMockRun();

//     // Mock YTD failure
//     vi.mocked(loadFinalizedRunHistory).mockRejectedValue(new Error('Storage error'));
//     vi.mocked(extractYtdData).mockReturnValue(undefined);
//     vi.mocked(computePaye).mockReturnValue({
//       paye: 12500,
//       annualRent: 0,
//       annualRentRelief: 0,
//       annualTaxableIncome: 1200000,
//       annualTax: 150000,
//     });

//     const result = await computeRun(run);

//     // Should still compute using non-YTD flow
//     expect(result).toBeDefined();
//     expect(result.items).toHaveLength(1);
//     expect(result.items[0].paye).toBe('12500.00');
//     expect(computePaye).toHaveBeenCalledWith(
//       expect.objectContaining({
//         enableYtd: false,
//       }),
//     );
//   });

//   it('should handle employee with no compensation history', async () => {
//     const runItem = createMockRunItem({
//       payProfileSnapshot: {
//         compensationHistory: [], // No compensation
//       },
//     });
//     const run = createMockRun();

//     vi.mocked(loadFinalizedRunHistory).mockResolvedValue([]);
//     vi.mocked(extractYtdData).mockReturnValue(undefined);
//     vi.mocked(computePaye).mockReturnValue({
//       paye: 0,
//       annualRent: 0,
//       annualRentRelief: 0,
//       annualTaxableIncome: 0,
//       annualTax: 0,
//     });

//     const result = await computeRun(run);

//     expect(result).toBeDefined();
//     expect(result.items).toHaveLength(1);
//     expect(result.items[0].gross).toBe('0.00');
//     expect(result.items[0].paye).toBe('0.00');
//   });
// });
