/**
 * Payroll Storage - Public API
 *
 * Export all storage functions with clear, descriptive names.
 */

export {
  // Runs index
  loadRunsIndex,

  // Individual runs
  loadRun,
  saveRun,
  deleteRun,

  // Company defaults
  loadCompanyDefaults,
  saveCompanyDefaults,

  // Employee directory
  loadEmployeeDirectory,
  saveEmployeeDirectory,
} from './payroll-storage';
