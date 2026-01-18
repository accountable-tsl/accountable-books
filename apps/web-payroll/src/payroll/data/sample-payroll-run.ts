import { addEmployeesToRun } from '../actions/add-employee';
import {
  DEMO_COMPANY_DEFAULTS,
  DEMO_COMPANY_ID,
} from '../data/company-defaults';
import {
  EmployeeRecordSchema,
  makeNewPayrollRun,
  makeRunItemFromEmployee,
} from '../domain';
import { generateId, getCurrentTimestamp } from '../utils';

import type { EmployeeRecord, PayrollRun } from '../domain';

/**
 * Sample Payroll Run Data
 *
 * Creates a demo payroll run and sample employee records.
 * The caller should use `addEmployeesToRun` to add these employees to the run.
 *
 * TODO: Recompute all values once tax computation is integrated to ensure valid payroll numbers or maybe create employee record, let system automatically compute the values.
 * The current values are realistic placeholders for demonstration purposes.
 */

// Sample employees defined directly as EmployeeRecords
const sampleEmployees: EmployeeRecord[] = [
  // Employee 1: Senior Engineer - Lagos, with pension, NHF, and deductions
  {
    identity: {
      id: crypto.randomUUID(),
      fullName: 'Adewale Ogunlesi',
      employeeId: 'AB-ENG-001',
      role: 'Senior Engineer',
      department: 'Engineering',
      email: 'adewale@example.com',
      bankName: 'GTBank',
      bankAccountNumber: '0123456789',
      joinDate: '2025-01-15',
    },
    payProfile: {
      state: 'Lagos',
      compensationHistory: [
        {
          fromMonth: '2026-01',
          annualGross: '12000000',
          annualBasic: '4800000', // 40% of gross
          annualHousing: '4800000', // 40% of gross
          annualTransport: '1200000', // 10% of gross
        },
      ],
      rentHistory: [
        {
          fromMonth: '2026-01',
          annualRent: '2400000',
        },
      ],
      pension: { enabled: true },
      nhf: { enabled: true },
      nhis: { enabled: false },
      recurringDeductions: [
        {
          id: crypto.randomUUID(),
          fromMonth: '2026-01',
          toMonth: '2026-12',
          name: 'Pension Additional',
          amount: '25000',
          taxTreatment: 'pension_voluntary',
        },
        {
          id: crypto.randomUUID(),
          fromMonth: '2026-03',
          toMonth: '2026-12',
          name: 'Owner Occupied Mortgage Interest',
          amount: '40000',
          taxTreatment: 'non_taxable',
        },
      ],
    },
  },
  // Employee 2: Product Manager - FCT, with pension and NHIS
  {
    identity: {
      id: crypto.randomUUID(),
      fullName: 'Chioma Okeke',
      employeeId: 'AB-PROD-002',
      role: 'Product Manager',
      department: 'Product',
      email: 'chioma@example.com',
      bankName: 'Access Bank',
      bankAccountNumber: '1234567890',
      joinDate: '2026-02-01',
    },
    payProfile: {
      state: 'Abuja',
      compensationHistory: [
        {
          fromMonth: '2026-01',
          annualGross: '9500000',
          annualBasic: '4275000', // 45% of gross
          annualHousing: '3325000', // 35% of gross
          annualTransport: '950000', // 10% of gross
        },
      ],
      pension: { enabled: true },
      nhf: { enabled: false },
      nhis: { enabled: true },
      recurringDeductions: [
        {
          id: crypto.randomUUID(),
          fromMonth: '2026-02',
          toMonth: '2026-12',
          name: 'Life Insurance Premium',
          amount: '12000',
          taxTreatment: 'non_taxable',
        },
      ],
    },
  },
  // Employee 3: Analyst - Kano, with varying statutory config
  {
    identity: {
      id: crypto.randomUUID(),
      fullName: "Musa Yar'adua",
      employeeId: 'AB-FIN-003',
      role: 'Analyst',
      department: 'Finance',
      email: 'musa@example.com',
      bankName: 'FirstBank',
      bankAccountNumber: '0987654321',
      joinDate: '2025-09-10',
    },
    payProfile: {
      state: 'Kano',
      compensationHistory: [
        {
          fromMonth: '2026-01',
          annualGross: '4500000',
          annualBasic: '1800000',
          annualHousing: '1200000',
          annualTransport: '450000',
        },
      ],
      rentHistory: [
        {
          fromMonth: '2026-01',
          annualRent: '900000',
        },
      ],
      nhf: { enabled: false },
      nhis: { enabled: false },
    },
  },
];
/**
 * Create a sample payroll run with realistic employee data
 *
 * Returns an empty run and employee records. The caller should use the
 * `addEmployeesToRun` action to add these employees to the run.
 *
 * @param periodMonth - Month number (1-12)
 * @param periodYear - Year (e.g., 2026)
 * @returns Empty PayrollRun and array of EmployeeRecords to add
 */
export function createSamplePayrollRun(
  periodMonth: number,
  periodYear: number,
): { run: PayrollRun; employees: EmployeeRecord[] } {
  const nowIso = getCurrentTimestamp();
  const runId = generateId();

  // Create the base run (empty, no items yet)
  const run = makeNewPayrollRun({
    id: runId,
    nowIso,
    companyName: DEMO_COMPANY_DEFAULTS.companyName,
    companyId: DEMO_COMPANY_ID,
    periodMonth,
    periodYear,
  });

  // Validate all employees (Zod will catch any schema violations)
  const employees = sampleEmployees.map((emp) =>
    EmployeeRecordSchema.parse(emp),
  );

  return { run, employees };
}

/**
 * Create a sample payroll run with in-memory items for preview.
 * This does not persist to storage.
 */
export function createSamplePayrollRunPreview(
  periodMonth: number,
  periodYear: number,
): { run: PayrollRun; employees: EmployeeRecord[] } {
  const { run, employees } = createSamplePayrollRun(periodMonth, periodYear);
  const items = employees.map((employee) =>
    makeRunItemFromEmployee({ id: generateId(), employee }),
  );

  return { run: { ...run, items }, employees };
}

/**
 * Create and persist a sample payroll run with employees.
 * This is the "one-step" helper used when the user opts into sample data.
 */
export async function createAndSaveSamplePayrollRun(
  periodMonth: number,
  periodYear: number,
): Promise<{ run: PayrollRun }> {
  const { run, employees } = createSamplePayrollRun(periodMonth, periodYear);
  const result = await addEmployeesToRun(run, employees);
  return { run: result.run };
}
