import { COMPANY_DEFAULTS, isDemoCompany } from '../data/company-defaults';
import {
  EmployeeDirectorySchema,
  PAYROLL_TOOL_SCHEMA_VERSION,
  PayrollCompanyDefaultsSchema,
  PayrollRunSchema,
  PayrollRunsIndexSchema,
} from '../domain';
import { getCurrentTimestamp } from '../utils';
import { logger } from '../utils/logger';
import {
  getCompanyDefaultsKey,
  getEmployeeDirectoryKey,
  getRunKey,
  getRunsIndexKey,
} from './keys';
import { storageDelete, storageGet, storageSet } from './kv';

import type {
  EmployeeDirectory,
  PayrollCompanyDefaults,
  PayrollRun,
  PayrollRunIndexEntry,
  PayrollRunsIndex,
} from '../domain';

/**
 * Payroll Storage - High-level functions for managing payroll data.
 *
 * This module provides clear, easy-to-understand functions for:
 * - Loading and saving payroll runs
 * - Managing the runs index (list of all runs)
 * - Company defaults (settings for new runs)
 * - Employee directory (reusable employee data)
 *
 * All functions use Zod schemas for validation and handle errors gracefully.
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an empty runs index (used when no index exists yet)
 */
function createEmptyRunsIndex(): PayrollRunsIndex {
  return {
    schemaVersion: PAYROLL_TOOL_SCHEMA_VERSION,
    runs: [],
  };
}

// ============================================================================
// Payroll Runs Index (List of All Runs)
// ============================================================================

/**
 * Load the list of all payroll runs.
 *
 * Returns an empty index if none exists or if there's an error.
 * Runs are sorted by most recently updated first.
 *
 * @returns The runs index with all payroll run summaries
 */
export async function loadRunsIndex(): Promise<PayrollRunsIndex> {
  try {
    const key = getRunsIndexKey();
    const raw = await storageGet(key);

    // If no data exists, return empty index
    if (!raw) {
      return createEmptyRunsIndex();
    }

    // Validate and parse the data
    const parsed = PayrollRunsIndexSchema.safeParse(raw);
    if (!parsed.success) {
      // If data is invalid, return empty index
      return createEmptyRunsIndex();
    }

    // Sort runs by most recently updated first
    const sortedRuns = [...parsed.data.runs].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );

    return {
      ...parsed.data,
      runs: sortedRuns,
    };
  } catch (error) {
    // On any error, return empty index
    logger.error('Error loading runs index', error);
    return createEmptyRunsIndex();
  }
}

/**
 * Save the runs index to storage.
 *
 * This is called automatically when saving a run, but can be used
 * directly if needed.
 *
 * @param index - The runs index to save
 */
async function saveRunsIndex(index: PayrollRunsIndex): Promise<void> {
  try {
    const key = getRunsIndexKey();
    const validated = PayrollRunsIndexSchema.parse(index);
    await storageSet(key, validated);
  } catch (error) {
    logger.error('Error saving runs index', error);
    throw new Error('Failed to save runs index');
  }
}

// ============================================================================
// Individual Payroll Runs
// ============================================================================

/**
 * Load a specific payroll run by ID.
 *
 * @param runId - The unique ID of the run to load
 * @returns The payroll run, or null if not found or invalid
 */
export async function loadRun(runId: string): Promise<PayrollRun | null> {
  try {
    const key = getRunKey(runId);
    const raw = await storageGet(key);

    if (!raw) {
      return null;
    }

    // Validate and parse the data
    const parsed = PayrollRunSchema.safeParse(raw);
    if (!parsed.success) {
      logger.error('Invalid payroll run data', parsed.error, { runId });
      return null;
    }

    return parsed.data;
  } catch (error) {
    logger.error('Error loading payroll run', error, { runId });
    return null;
  }
}

/**
 * Initialize company defaults with standard Nigerian payroll defaults.
 * This is called lazily when the first run is saved.
 */
async function initializeCompanyDefaultsIfNeeded(
  run?: PayrollRun,
): Promise<void> {
  const existing = await loadCompanyDefaults();
  if (existing) {
    // Defaults already exist, no need to initialize
    return;
  }

  // Initialize with standard Nigerian defaults
  const defaults: PayrollCompanyDefaults = {
    ...COMPANY_DEFAULTS,
    companyId: run?.companyId,
    companyName: run?.companyName ?? COMPANY_DEFAULTS.companyName,
    settings: run?.settings ?? COMPANY_DEFAULTS.settings,
    updatedAt: getCurrentTimestamp(),
  };

  const validated = PayrollCompanyDefaultsSchema.parse(defaults);

  const key = getCompanyDefaultsKey();
  await storageSet(key, validated);
}

/**
 * Save a payroll run to storage.
 *
 * This function:
 * 1. Initializes company defaults if this is the first run
 * 2. Updates the run's `updatedAt` timestamp
 * 3. Validates the run data
 * 4. Saves the run to storage
 * 5. Updates the runs index to include this run
 *
 * @param run - The payroll run to save
 * @returns The saved run (with updated timestamp)
 */
export async function saveRun(run: PayrollRun): Promise<PayrollRun> {
  try {
    // Lazy initialization: check if this is the first run
    // If no defaults exist, initialize them now
    await initializeCompanyDefaultsIfNeeded(run);

    // Update timestamp
    const updatedRun: PayrollRun = {
      ...run,
      updatedAt: getCurrentTimestamp(),
    };

    // Validate the run
    const validated = PayrollRunSchema.parse(updatedRun);

    // Save the run
    const key = getRunKey(validated.id);
    await storageSet(key, validated);

    // Update the runs index
    const index = await loadRunsIndex();

    // Generate label: show range for multi-period runs, single month for single-period
    const startKey = `${validated.periodYear}-${String(validated.periodMonth).padStart(2, '0')}`;
    const label =
      validated.periodEndMonth != null && validated.periodEndYear != null
        ? `${startKey} to ${validated.periodEndYear}-${String(validated.periodEndMonth).padStart(2, '0')}`
        : startKey;

    // Create or update the index entry for this run
    // Note: isDemo is metadata stored in index, not in the run schema
    const isDemo = validated.companyId
      ? isDemoCompany(validated.companyId)
      : false;

    const indexEntry = {
      id: validated.id,
      companyId: validated.companyId,
      label,
      companyName: validated.companyName,
      periodMonth: validated.periodMonth,
      periodYear: validated.periodYear,
      periodEndMonth: validated.periodEndMonth,
      periodEndYear: validated.periodEndYear,
      status: validated.status,
      finalizedAt: validated.finalizedAt,
      isDemo,
      updatedAt: validated.updatedAt,
    } satisfies PayrollRunsIndex['runs'][number];

    // Remove old entry if it exists, then add new one at the front
    const filteredRuns = index.runs.filter((r) => r.id !== indexEntry.id);
    const updatedIndex: PayrollRunsIndex = {
      schemaVersion: PAYROLL_TOOL_SCHEMA_VERSION,
      runs: [indexEntry, ...filteredRuns],
    };

    await saveRunsIndex(updatedIndex);

    return validated;
  } catch (error) {
    console.error('Error saving payroll run:', error);
    throw new Error('Failed to save payroll run');
  }
}

/**
 * Find an existing finalized run for the same company, month, and year.
 *
 * Used to check for conflicts before finalizing a new run.
 * Only one finalized run should exist per (company, month, year) combination.
 *
 * @param run - The run to check for conflicts
 * @returns The existing finalized run index entry if found, null otherwise
 */
export async function findExistingFinalizedRun(
  run: PayrollRun,
): Promise<PayrollRunIndexEntry | null> {
  try {
    const index = await loadRunsIndex();

    // Find finalized runs matching the same company, month, and year
    const existingRun = index.runs.find(
      (r) =>
        r.status === 'final' &&
        r.periodYear === run.periodYear &&
        r.periodMonth === run.periodMonth &&
        // Match companyId: both undefined means same company, or both have same value
        (r.companyId === run.companyId ||
          (r.companyId == null && run.companyId == null)) &&
        // Don't match the run to itself
        r.id !== run.id,
    );

    return existingRun || null;
  } catch (error) {
    logger.error('Error finding existing finalized run', error, {
      runId: run.id,
      periodMonth: run.periodMonth,
      periodYear: run.periodYear,
    });
    return null;
  }
}

/**
 * Find a run (draft or final) for a specific period and company.
 *
 * Used to check if a run already exists for a given month/year when the user
 * changes the period in the UI.
 *
 * @param periodMonth - The month (1-12)
 * @param periodYear - The year
 * @param companyId - Optional company ID to match
 * @returns The run index entry if found, null otherwise
 */
export async function findRunByPeriod(
  periodMonth: number,
  periodYear: number,
  companyId?: string,
): Promise<PayrollRunIndexEntry | null> {
  try {
    const index = await loadRunsIndex();

    // Find runs matching the same company, month, and year
    const existingRun = index.runs.find(
      (r) =>
        r.periodYear === periodYear &&
        r.periodMonth === periodMonth &&
        // Match companyId: both undefined means same company, or both have same value
        (r.companyId === companyId ||
          (r.companyId == null && companyId == null)),
    );

    return existingRun || null;
  } catch (error) {
    logger.error('Error finding run by period', error, {
      periodMonth,
      periodYear,
      companyId,
    });
    return null;
  }
}

/**
 * Find all payroll runs that contain a specific employee.
 *
 * This is useful for:
 * - Generating payslip history for an employee
 * - Viewing all payroll runs an employee has been part of
 * - Building employee-specific reports
 *
 * Note: This loads full runs (not just index entries) to check for the employee,
 * so it may be slower for large numbers of runs. Consider filtering by date range
 * if performance becomes an issue.
 *
 * @param employeeRefId - The employee's reference ID (from EmployeeRecord.identity.id)
 * @param options - Optional filters
 * @returns Array of runs that contain this employee, sorted by period (earliest first)
 */
export async function findRunsForEmployee(
  employeeRefId: string,
  options?: {
    companyId?: string;
    status?: 'draft' | 'final';
    year?: number;
  },
): Promise<PayrollRun[]> {
  try {
    const runsIndex = await loadRunsIndex();
    const matchingRuns: PayrollRun[] = [];

    // Filter runs by options first (before loading full runs)
    let candidateRuns = runsIndex.runs;
    if (options?.companyId !== undefined) {
      candidateRuns = candidateRuns.filter(
        (r) =>
          r.companyId === options.companyId ||
          (r.companyId == null && options.companyId == null),
      );
    }
    if (options?.status) {
      candidateRuns = candidateRuns.filter((r) => r.status === options.status);
    }
    if (options?.year) {
      candidateRuns = candidateRuns.filter(
        (r) => r.periodYear === options.year,
      );
    }

    // Load each candidate run and check if it contains the employee
    for (const indexEntry of candidateRuns) {
      const run = await loadRun(indexEntry.id);
      if (run) {
        // Check if any item in this run matches the employee
        const hasEmployee = run.items.some(
          (item) => item.employeeRefId === employeeRefId,
        );
        if (hasEmployee) {
          matchingRuns.push(run);
        }
      }
    }

    // Sort by period (earliest first)
    matchingRuns.sort((a, b) => {
      if (a.periodYear !== b.periodYear) {
        return a.periodYear - b.periodYear;
      }
      return a.periodMonth - b.periodMonth;
    });

    return matchingRuns;
  } catch (error) {
    logger.error('Error finding runs for employee', error, {
      employeeRefId,
      options,
    });
    return [];
  }
}

/**
 * Delete a payroll run from storage.
 *
 * This removes both the run data and its entry from the runs index.
 *
 * @param runId - The unique ID of the run to delete
 */
export async function deleteRun(runId: string): Promise<void> {
  try {
    // Delete the run data
    const key = getRunKey(runId);
    await storageDelete(key);

    // Remove from index
    const index = await loadRunsIndex();
    const filteredRuns = index.runs.filter((r) => r.id !== runId);
    const updatedIndex: PayrollRunsIndex = {
      schemaVersion: PAYROLL_TOOL_SCHEMA_VERSION,
      runs: filteredRuns,
    };

    await saveRunsIndex(updatedIndex);
  } catch (error) {
    logger.error('Error deleting payroll run', error, { runId });
    throw new Error('Failed to delete payroll run');
  }
}

// ============================================================================
// Company Defaults
// ============================================================================

/**
 * Load company defaults (settings that apply to new runs).
 *
 * @returns Company defaults, or null if none exist
 */
export async function loadCompanyDefaults(): Promise<PayrollCompanyDefaults | null> {
  try {
    const key = getCompanyDefaultsKey();
    const raw = await storageGet(key);

    if (!raw) {
      return null;
    }

    const parsed = PayrollCompanyDefaultsSchema.safeParse(raw);
    if (!parsed.success) {
      logger.error('Invalid company defaults data', parsed.error);
      return null;
    }

    return parsed.data;
  } catch (error) {
    logger.error('Error loading company defaults', error);
    return null;
  }
}

/**
 * Save company defaults.
 *
 * @param input - Company defaults to save (companyName and/or settings)
 * @returns The saved company defaults
 */
export async function saveCompanyDefaults(input: {
  companyName?: string;
  settings?: PayrollCompanyDefaults['settings'];
}): Promise<PayrollCompanyDefaults> {
  try {
    const defaults: PayrollCompanyDefaults = {
      schemaVersion: PAYROLL_TOOL_SCHEMA_VERSION,
      companyName: input.companyName ?? 'Company',
      settings: input.settings,
      updatedAt: getCurrentTimestamp(),
    };

    const validated = PayrollCompanyDefaultsSchema.parse(defaults);
    const key = getCompanyDefaultsKey();
    await storageSet(key, validated);

    return validated;
  } catch (error) {
    logger.error('Error saving company defaults', error, {
      companyName: input.companyName,
    });
    throw new Error('Failed to save company defaults');
  }
}

// ============================================================================
// Employee Directory (Reusable Employee Data)
// ============================================================================

/**
 * Load the employee directory (reusable employee data).
 * Returns null if no directory exists yet.
 */
export async function loadEmployeeDirectory(): Promise<EmployeeDirectory | null> {
  const raw = await storageGet(getEmployeeDirectoryKey());
  if (!raw) return null;

  const parsed = EmployeeDirectorySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Save the employee directory.
 * Creates a new directory if it doesn't exist, or updates an existing one.
 */
export async function saveEmployeeDirectory(
  directory: Omit<
    EmployeeDirectory,
    'schemaVersion' | 'updatedAt' | 'createdAt'
  > & {
    createdAt?: string;
  },
): Promise<EmployeeDirectory> {
  const nowIso = getCurrentTimestamp();
  const record: EmployeeDirectory = {
    schemaVersion: PAYROLL_TOOL_SCHEMA_VERSION,
    employeesById: directory.employeesById,
    createdAt: directory.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
  const validated = EmployeeDirectorySchema.parse(record);
  await storageSet(getEmployeeDirectoryKey(), validated);
  return validated;
}
