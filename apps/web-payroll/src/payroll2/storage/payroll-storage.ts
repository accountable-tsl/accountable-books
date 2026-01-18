import {
  EmployeeDirectorySchema,
  type EmployeeDirectory,
  PAYROLL_TOOL_SCHEMA_VERSION,
  PayrollCompanyDefaultsSchema,
  type PayrollCompanyDefaults,
  PayrollRunSchema,
  type PayrollRun,
  PayrollRunsIndexSchema,
  type PayrollRunsIndex,
} from '@/payroll2/domain';

import { kvDel, kvGet, kvSet } from './kv';
import {
  keyCompanyDefaults,
  keyEmployeeDirectory,
  keyRun,
  keyRunsIndex,
} from './keys';

function nowIso() {
  return new Date().toISOString();
}

function emptyRunsIndex(): PayrollRunsIndex {
  return { schemaVersion: PAYROLL_TOOL_SCHEMA_VERSION, runs: [] };
}

export async function loadRunsIndex(): Promise<PayrollRunsIndex> {
  const raw = await kvGet(keyRunsIndex());
  if (!raw) return emptyRunsIndex();

  const parsed = PayrollRunsIndexSchema.safeParse(raw);
  if (!parsed.success) return emptyRunsIndex();

  return {
    ...parsed.data,
    runs: [...parsed.data.runs].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ),
  };
}

async function saveRunsIndex(index: PayrollRunsIndex) {
  const validated = PayrollRunsIndexSchema.parse(index);
  await kvSet(keyRunsIndex(), validated);
}

export async function saveRun(run: PayrollRun): Promise<PayrollRun> {
  const updated: PayrollRun = { ...run, updatedAt: nowIso() };
  const validated = PayrollRunSchema.parse(updated);
  await kvSet(keyRun(validated.id), validated);

  const index = await loadRunsIndex();
  const entry = {
    id: validated.id,
    label: `${validated.periodYear}-${String(validated.periodMonth).padStart(2, '0')}`,
    companyName: validated.companyName,
    periodMonth: validated.periodMonth,
    periodYear: validated.periodYear,
    status: validated.status,
    finalizedAt: validated.finalizedAt,
    updatedAt: validated.updatedAt,
  } satisfies PayrollRunsIndex['runs'][number];

  const nextRuns = [entry, ...index.runs.filter((r) => r.id !== entry.id)];
  await saveRunsIndex({ schemaVersion: PAYROLL_TOOL_SCHEMA_VERSION, runs: nextRuns });
  return validated;
}

export async function loadRun(runId: string): Promise<PayrollRun | null> {
  const raw = await kvGet(keyRun(runId));
  if (!raw) return null;

  const parsed = PayrollRunSchema.safeParse(raw);
  if (!parsed.success) return null;

  return parsed.data;
}

export async function deleteRun(runId: string): Promise<void> {
  await kvDel(keyRun(runId));
  const index = await loadRunsIndex();
  const nextRuns = index.runs.filter((r) => r.id !== runId);
  await saveRunsIndex({ schemaVersion: PAYROLL_TOOL_SCHEMA_VERSION, runs: nextRuns });
}

export async function loadCompanyDefaults(): Promise<PayrollCompanyDefaults | null> {
  const raw = await kvGet(keyCompanyDefaults());
  if (!raw) return null;
  const parsed = PayrollCompanyDefaultsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function saveCompanyDefaults(input: {
  companyName?: string;
  settings?: PayrollCompanyDefaults['settings'];
}): Promise<PayrollCompanyDefaults> {
  const record: PayrollCompanyDefaults = {
    schemaVersion: PAYROLL_TOOL_SCHEMA_VERSION,
    companyName: input.companyName,
    settings: input.settings,
    updatedAt: nowIso(),
  };
  const validated = PayrollCompanyDefaultsSchema.parse(record);
  await kvSet(keyCompanyDefaults(), validated);
  return validated;
}

export async function loadEmployeeDirectory(): Promise<EmployeeDirectory | null> {
  const raw = await kvGet(keyEmployeeDirectory());
  if (!raw) return null;
  const parsed = EmployeeDirectorySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function saveEmployeeDirectory(
  directory: Omit<EmployeeDirectory, 'schemaVersion' | 'updatedAt' | 'createdAt'> & {
    createdAt?: string;
  },
): Promise<EmployeeDirectory> {
  const record: EmployeeDirectory = {
    schemaVersion: PAYROLL_TOOL_SCHEMA_VERSION,
    employeesById: directory.employeesById,
    createdAt: directory.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
  const validated = EmployeeDirectorySchema.parse(record);
  await kvSet(keyEmployeeDirectory(), validated);
  return validated;
}
