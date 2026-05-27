import type {
  EmployeeRecord,
  PayrollCompanyDefaults,
  PayrollRun,
  PayrollRunItem,
} from '@/payroll/domain';
import {
  makeNewEmployeeRecord,
  makeRunItemFromEmployee,
} from '@/payroll/domain';
import {
  loadEmployeeDirectory,
  saveEmployeeDirectory,
  saveRun,
} from '@/payroll/storage';
import {
  formatMonthKey,
  generateId,
  getCurrentTimestamp,
} from '@/payroll/utils';

/**
 * Add multiple employees to a payroll run in one efficient batch operation
 *
 * This is the core action that handles:
 * 1. Saving all EmployeeRecords to the directory (single I/O operation)
 * 2. Creating PayrollRunItems for each employee
 * 3. Updating and saving the PayrollRun
 *
 * Use cases:
 * - Sample data generation (3 employees)
 * - Bulk CSV import (N employees)
 * - Single employee addition (via wrapper)
 *
 * @param run - The payroll run to add employees to
 * @param employees - Array of EmployeeRecords to add
 * @returns Updated run and array of created run items
 */
export async function addEmployeesToRun(
  run: PayrollRun,
  employees: EmployeeRecord[],
): Promise<{ run: PayrollRun; runItems: PayrollRunItem[] }> {
  if (employees.length === 0) {
    return { run, runItems: [] };
  }

  // Load existing employee directory (once for all employees)
  const directory = await loadEmployeeDirectory();

  // Merge all new employees into directory
  const updatedDirectory = {
    employeesById: {
      ...(directory?.employeesById ?? {}),
      ...Object.fromEntries(employees.map((emp) => [emp.identity.id, emp])),
    },
  };

  // Save directory once with all employees
  await saveEmployeeDirectory(updatedDirectory);

  // Create run items for all employees
  const newRunItems = employees.map((employee) => {
    const runItemId = generateId();
    return makeRunItemFromEmployee({
      id: runItemId,
      employee,
    });
  });

  // Update run with new items (prepend to show newest first)
  const updatedRun = {
    ...run,
    items: [...newRunItems, ...run.items],
    updatedAt: getCurrentTimestamp(),
  };

  // Save run
  const savedRun = await saveRun(updatedRun);

  return { run: savedRun, runItems: newRunItems };
}

/**
 * Add a single new employee to the current payroll run
 *
 * Convenience wrapper around `addEmployeesToRun` for the common single-add use case.
 * Creates a blank employee record and delegates to the batch action.
 *
 * @param run - The payroll run to add the employee to
 * @param companySettings - Company defaults for state and other settings
 * @param fullName - Employee name (defaults to 'New Employee' placeholder)
 * @returns Object containing the updated PayrollRun and the newly created PayrollRunItem
 */
export async function addEmployeeToRun(
  run: PayrollRun,
  companySettings: PayrollCompanyDefaults,
  fullName: string = 'New Employee',
): Promise<{ run: PayrollRun; runItem: PayrollRunItem }> {
  // Use company default state, or current run's default state, or fallback to Lagos
  const defaultState =
    run.settings?.defaultState ??
    companySettings.settings?.defaultState ??
    'Lagos';

  // Create a blank EmployeeRecord
  const employeeRecord = makeNewEmployeeRecord({
    id: generateId(),
    fullName,
    state: defaultState,
    annualGross: '0',
    fromMonth: formatMonthKey(String(run.periodYear), String(run.periodMonth)),
  });

  // Delegate to batch action
  const result = await addEmployeesToRun(run, [employeeRecord]);

  // Return single-item result
  return { run: result.run, runItem: result.runItems[0] };
}
