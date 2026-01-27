// import { describe, it, expect, vi, beforeEach } from 'vitest';
// import { extractYtdData, loadFinalizedRunHistory } from './extract-ytd';
// import type { PayrollRun, PayrollRunItem } from '../domain';

// // Mock storage functions
// vi.mock('../storage', () => ({
//   loadRunsIndex: vi.fn(),
//   loadRun: vi.fn(),
// }));

// import { loadRunsIndex, loadRun } from '../storage';

// /**
//  * Test suite for YTD data extraction
//  *
//  * Tests cover:
//  * - Loading finalized run history
//  * - Extracting monthly actuals
//  * - Calculating YTD totals
//  * - Projecting annual amounts
//  * - Handling exempt income and loss of employment cap
//  * - Edge cases (no history, partial employment, etc.)
//  */

// describe('loadFinalizedRunHistory', () => {
//   beforeEach(() => {
//     vi.clearAllMocks();
//   });

//   it('should load finalized runs from same tax year only', async () => {
//     const currentRun: PayrollRun = {
//       id: 'run-2024-03',
//       companyId: 'company-1',
//       companyName: 'Test Company',
//       periodMonth: 3,
//       periodYear: 2024,
//       status: 'draft',
//       items: [],
//       settings: {},
//       createdAt: '2024-03-01T00:00:00Z',
//       updatedAt: '2024-03-01T00:00:00Z',
//     };

//     // Mock runs index with runs from different years
//     vi.mocked(loadRunsIndex).mockResolvedValue({
//       schemaVersion: 1,
//       runs: [
//         {
//           id: 'run-2023-12',
//           companyId: 'company-1',
//           label: '2023-12',
//           periodMonth: 12,
//           periodYear: 2023,
//           status: 'final',
//           updatedAt: '2023-12-01T00:00:00Z',
//         },
//         {
//           id: 'run-2024-01',
//           companyId: 'company-1',
//           label: '2024-01',
//           periodMonth: 1,
//           periodYear: 2024,
//           status: 'final',
//           updatedAt: '2024-01-01T00:00:00Z',
//         },
//         {
//           id: 'run-2024-02',
//           companyId: 'company-1',
//           label: '2024-02',
//           periodMonth: 2,
//           periodYear: 2024,
//           status: 'final',
//           updatedAt: '2024-02-01T00:00:00Z',
//         },
//         {
//           id: 'run-2025-01',
//           companyId: 'company-1',
//           label: '2025-01',
//           periodMonth: 1,
//           periodYear: 2025,
//           status: 'final',
//           updatedAt: '2025-01-01T00:00:00Z',
//         },
//       ],
//     });

//     // Mock loadRun for each eligible run
//     vi.mocked(loadRun).mockImplementation((id) => {
//       if (id === 'run-2024-01') {
//         return Promise.resolve({
//           id: 'run-2024-01',
//           companyId: 'company-1',
//           companyName: 'Test Company',
//           periodMonth: 1,
//           periodYear: 2024,
//           status: 'final',
//           items: [],
//           settings: {},
//           createdAt: '2024-01-01T00:00:00Z',
//           updatedAt: '2024-01-01T00:00:00Z',
//         });
//       }
//       if (id === 'run-2024-02') {
//         return Promise.resolve({
//           id: 'run-2024-02',
//           companyId: 'company-1',
//           companyName: 'Test Company',
//           periodMonth: 2,
//           periodYear: 2024,
//           status: 'final',
//           items: [],
//           settings: {},
//           createdAt: '2024-02-01T00:00:00Z',
//           updatedAt: '2024-02-01T00:00:00Z',
//         });
//       }
//       return Promise.resolve(null);
//     });

//     const history = await loadFinalizedRunHistory(currentRun);

//     // Should only include runs from 2024, months 1-3
//     expect(history).toHaveLength(2);
//     expect(history[0].periodMonth).toBe(1);
//     expect(history[1].periodMonth).toBe(2);
//     expect(history.every((r) => r.periodYear === 2024)).toBe(true);
//   });

//   it('should exclude draft runs', async () => {
//     const currentRun: PayrollRun = {
//       id: 'run-2024-03',
//       companyId: 'company-1',
//       companyName: 'Test Company',
//       periodMonth: 3,
//       periodYear: 2024,
//       status: 'draft',
//       items: [],
//       settings: {},
//       createdAt: '2024-03-01T00:00:00Z',
//       updatedAt: '2024-03-01T00:00:00Z',
//     };

//     vi.mocked(loadRunsIndex).mockResolvedValue({
//       schemaVersion: 1,
//       runs: [
//         {
//           id: 'run-2024-01',
//           companyId: 'company-1',
//           label: '2024-01',
//           periodMonth: 1,
//           periodYear: 2024,
//           status: 'draft', // Draft run
//           updatedAt: '2024-01-01T00:00:00Z',
//         },
//         {
//           id: 'run-2024-02',
//           companyId: 'company-1',
//           label: '2024-02',
//           periodMonth: 2,
//           periodYear: 2024,
//           status: 'final',
//           updatedAt: '2024-02-01T00:00:00Z',
//         },
//       ],
//     });

//     vi.mocked(loadRun).mockImplementation((id) => {
//       if (id === 'run-2024-02') {
//         return Promise.resolve({
//           id: 'run-2024-02',
//           companyId: 'company-1',
//           companyName: 'Test Company',
//           periodMonth: 2,
//           periodYear: 2024,
//           status: 'final',
//           items: [],
//           settings: {},
//           createdAt: '2024-02-01T00:00:00Z',
//           updatedAt: '2024-02-01T00:00:00Z',
//         });
//       }
//       return Promise.resolve(null);
//     });

//     const history = await loadFinalizedRunHistory(currentRun);

//     // Should only include finalized run
//     expect(history).toHaveLength(1);
//     expect(history[0].id).toBe('run-2024-02');
//   });

//   it('should exclude runs from different companies', async () => {
//     const currentRun: PayrollRun = {
//       id: 'run-2024-03',
//       companyId: 'company-1',
//       companyName: 'Test Company',
//       periodMonth: 3,
//       periodYear: 2024,
//       status: 'draft',
//       items: [],
//       settings: {},
//       createdAt: '2024-03-01T00:00:00Z',
//       updatedAt: '2024-03-01T00:00:00Z',
//     };

//     vi.mocked(loadRunsIndex).mockResolvedValue({
//       schemaVersion: 1,
//       runs: [
//         {
//           id: 'run-2024-01',
//           companyId: 'company-1', // Same company
//           label: '2024-01',
//           periodMonth: 1,
//           periodYear: 2024,
//           status: 'final',
//           updatedAt: '2024-01-01T00:00:00Z',
//         },
//         {
//           id: 'run-2024-02',
//           companyId: 'company-2', // Different company
//           label: '2024-02',
//           periodMonth: 2,
//           periodYear: 2024,
//           status: 'final',
//           updatedAt: '2024-02-01T00:00:00Z',
//         },
//       ],
//     });

//     vi.mocked(loadRun).mockImplementation((id) => {
//       if (id === 'run-2024-01') {
//         return Promise.resolve({
//           id: 'run-2024-01',
//           companyId: 'company-1',
//           companyName: 'Test Company',
//           periodMonth: 1,
//           periodYear: 2024,
//           status: 'final',
//           items: [],
//           settings: {},
//           createdAt: '2024-01-01T00:00:00Z',
//           updatedAt: '2024-01-01T00:00:00Z',
//         });
//       }
//       return Promise.resolve(null);
//     });

//     const history = await loadFinalizedRunHistory(currentRun);

//     // Should only include run from same company
//     expect(history).toHaveLength(1);
//     expect(history[0].id).toBe('run-2024-01');
//   });
// });

// describe('extractYtdData', () => {
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
//       settings: {},
//       createdAt: '2024-03-01T00:00:00Z',
//       updatedAt: '2024-03-01T00:00:00Z',
//       ...overrides,
//     };
//   };

//   it('should return undefined if employee cannot be matched (no refId or taxId)', () => {
//     const runItem = createMockRunItem({
//       employeeSnapshot: {
//         fullName: 'John Doe',
//         taxId: undefined,
//         identity: {
//           id: undefined,
//           type: 'tax_id',
//         },
//       },
//     });
//     const run = createMockRun();

//     const result = extractYtdData(runItem, run, []);

//     expect(result).toBeUndefined();
//   });

//   it('should project annual gross from YTD data', () => {
//     const runItem = createMockRunItem();
//     const run = createMockRun();

//     // Employee worked 2 months (Jan, Feb) at 200k/month
//     // Current month (March): 200k/month
//     // YTD gross: 200k * 2 = 400k
//     // Current month: 200k
//     // Total YTD: 600k
//     // Worked months: 3
//     // Projected annual: (600k / 3) * 12 = 2.4M

//     const result = extractYtdData(runItem, run, []);

//     expect(result).toBeDefined();
//     expect(result?.projectedAnnualGross).toBe(2_400_000);
//     expect(result?.workedMonthUnits).toBe(1); // Only current month (no history)
//   });

//   it('should handle exempt income correctly', () => {
//     const runItem = createMockRunItem({
//       edits: {
//         oneOffAllowances: [
//           {
//             amount: '1000000',
//             taxTreatment: 'death_injury_compensation',
//             description: 'Death benefit',
//           },
//           {
//             amount: '500000',
//             taxTreatment: 'redundancy_payment',
//             description: 'Redundancy',
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

//     const result = extractYtdData(runItem, run, []);

//     expect(result).toBeDefined();
//     expect(result?.exemptIncome.deathInjuryCompensation).toBe(1_000_000);
//     expect(result?.exemptIncome.redundancyPayment).toBe(500_000);
//     expect(result?.exemptIncome.lossOfEmployment.total).toBe(30_000_000);
//     expect(result?.exemptIncome.lossOfEmployment.exempt).toBe(30_000_000); // Below cap
//     expect(result?.exemptIncome.lossOfEmployment.taxable).toBe(0);
//   });

//   it('should cap loss of employment at N50M per tax year', () => {
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
//     const run = createMockRun();

//     const result = extractYtdData(runItem, run, []);

//     expect(result).toBeDefined();
//     expect(result?.exemptIncome.lossOfEmployment.total).toBe(60_000_000);
//     expect(result?.exemptIncome.lossOfEmployment.exempt).toBe(50_000_000); // Capped
//     expect(result?.exemptIncome.lossOfEmployment.taxable).toBe(10_000_000); // Excess is taxable
//   });

//   it('should handle YTD loss of employment cap across multiple months', () => {
//     // Month 1: 30M loss of employment (exempt)
//     // Month 2: 30M loss of employment (20M exempt, 10M taxable)
//     // Total: 60M, but only 50M exempt

//     const runItem = createMockRunItem({
//       edits: {
//         oneOffAllowances: [
//           {
//             amount: '30000000', // 30M this month
//             taxTreatment: 'loss_of_employment_benefit',
//             description: 'Severance',
//           },
//         ],
//       },
//     });
//     const run = createMockRun();

//     // Create a finalized run from month 2 with 30M loss of employment
//     const finalizedRun: PayrollRun = {
//       id: 'run-2024-02',
//       companyId: 'company-1',
//       companyName: 'Test Company',
//       periodMonth: 2,
//       periodYear: 2024,
//       status: 'final',
//       items: [
//         {
//           id: 'item-1',
//           employeeSnapshot: {
//             fullName: 'John Doe',
//             taxId: 'TAX123',
//             identity: {
//               id: 'emp-1',
//               type: 'tax_id',
//             },
//           },
//           payProfileSnapshot: {
//             compensationHistory: [
//               {
//                 periodStart: '2024-01-01',
//                 periodEnd: null,
//                 annualGross: '2400000',
//               },
//             ],
//           },
//           edits: {
//             oneOffAllowances: [
//               {
//                 amount: '30000000', // 30M in month 2
//                 taxTreatment: 'loss_of_employment_benefit',
//                 description: 'Severance',
//               },
//             ],
//           },
//         },
//       ],
//       settings: {},
//       computed: {
//         items: [
//           {
//             runItemId: 'item-1',
//             paye: '0',
//           },
//         ],
//       },
//       createdAt: '2024-02-01T00:00:00Z',
//       updatedAt: '2024-02-01T00:00:00Z',
//     };

//     const result = extractYtdData(runItem, run, [finalizedRun]);

//     expect(result).toBeDefined();
//     // Total: 30M (month 2) + 30M (month 3) = 60M
//     // Exempt: min(60M, 50M) = 50M
//     // Month 3 exempt: min(30M, 50M - 30M) = 20M
//     expect(result?.exemptIncome.lossOfEmployment.total).toBe(60_000_000);
//     expect(result?.exemptIncome.lossOfEmployment.exempt).toBe(50_000_000);
//     expect(result?.exemptIncome.lossOfEmployment.taxable).toBe(10_000_000);
//   });

//   it('should annualize recurring deductions but not one-off deductions', () => {
//     const runItem = createMockRunItem({
//       edits: {
//         recurringDeductions: [
//           {
//             amount: '10000', // 10k/month voluntary pension
//             taxTreatment: 'pension_voluntary',
//             description: 'Voluntary pension',
//           },
//         ],
//         oneOffDeductions: [
//           {
//             amount: '50000', // 50k one-time contribution
//             taxTreatment: 'pension_voluntary',
//             description: 'One-time pension',
//           },
//         ],
//       },
//     });
//     const run = createMockRun();

//     const result = extractYtdData(runItem, run, []);

//     expect(result).toBeDefined();
//     // Recurring: 10k/month * 12 = 120k annual
//     // One-off: 50k (not annualized)
//     // Total: 120k + 50k = 170k
//     expect(result?.projectedAnnualAllowableDeductions).toBe(170_000);
//   });

//   it('should return undefined if no months worked', () => {
//     const runItem = createMockRunItem({
//       payProfileSnapshot: {
//         compensationHistory: [], // No compensation = not employed
//       },
//     });
//     const run = createMockRun();

//     const result = extractYtdData(runItem, run, []);

//     expect(result).toBeUndefined();
//   });

//   it('should handle partial employment (proration)', () => {
//     const runItem = createMockRunItem({
//       employeeSnapshot: {
//         fullName: 'John Doe',
//         taxId: 'TAX123',
//         identity: {
//           id: 'emp-1',
//           type: 'tax_id',
//         },
//         joinDate: '2024-03-15', // Joined mid-month
//       },
//     });
//     const run = createMockRun({
//       periodMonth: 3,
//       periodYear: 2024,
//     });

//     const result = extractYtdData(runItem, run, []);

//     expect(result).toBeDefined();
//     // Employment fraction should be less than 1.0 (partial month)
//     // Assuming calendar_days proration: (31 - 15 + 1) / 31 ≈ 0.548
//     expect(result?.workedMonthUnits).toBeLessThan(1.0);
//     expect(result?.workedMonthUnits).toBeGreaterThan(0);
//   });
// });
