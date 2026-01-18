import { COMPANY_DEFAULTS, isDemoCompany } from '../data/company-defaults';
import {
  EmployeeDirectorySchema,
  PAYROLL_TOOL_SCHEMA_VERSION,
  PayrollCompanyDefaultsSchema,
  PayrollRunSchema,
  PayrollRunsIndexSchema,
} from '../domain';
import { getCurrentTimestamp } from '../utils';
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
    console.error('Error loading runs index:', error);
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
    console.error('Error saving runs index:', error);
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
      console.error('Invalid payroll run data:', parsed.error);
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.error('Error loading payroll run:', error);
    return null;
  }
}

/**
 * Initialize company defaults with standard Nigerian payroll defaults.
 * This is called lazily when the first run is saved.
 */
async function initializeCompanyDefaultsIfNeeded(): Promise<void> {
  const existing = await loadCompanyDefaults();
  if (existing) {
    // Defaults already exist, no need to initialize
    return;
  }

  // Initialize with standard Nigerian defaults
  const defaults: PayrollCompanyDefaults = {
    ...COMPANY_DEFAULTS,
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
    await initializeCompanyDefaultsIfNeeded();

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
    console.error('Error deleting payroll run:', error);
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
      console.error('Invalid company defaults data:', parsed.error);
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.error('Error loading company defaults:', error);
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
    console.error('Error saving company defaults:', error);
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
