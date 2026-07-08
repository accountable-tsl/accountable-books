import { ngnMoneyFormatter } from './payroll-table-utils';

import type {
  PayrollComputedItem,
  PayrollRunItem,
  SettingsResolution,
} from '../domain';

function formatRate(rate: number): string {
  const pct = rate * 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

export function formatStatutorySummary(config: {
  enabled?: boolean;
  employeeRate?: number;
  employerRate?: number;
  employeeAmount?: string;
  employerAmount?: string;
}): string {
  if (config.enabled === false) {
    return 'opted out';
  }

  const parts: string[] = [];
  if (config.employeeRate != null) {
    parts.push(`${formatRate(config.employeeRate)} EE`);
  } else if (config.employeeAmount != null) {
    parts.push(`₦${config.employeeAmount}/mo EE`);
  }
  if (config.employerRate != null) {
    parts.push(`${formatRate(config.employerRate)} ER`);
  } else if (config.employerAmount != null) {
    parts.push(`₦${config.employerAmount}/mo ER`);
  }

  return parts.length > 0 ? parts.join(', ') : 'custom settings';
}

function getStatutoryOverrideNotes(resolution: SettingsResolution): string[] {
  const notes: string[] = [];

  if (resolution.pension.source === 'employee') {
    const summary = formatStatutorySummary(resolution.pension.config);
    if (
      !resolution.pension.companyEnabled &&
      resolution.pension.config.enabled !== false
    ) {
      notes.push(
        `Pension override (${summary}) — applies even when company pension is off`,
      );
    } else {
      notes.push(`Pension override: ${summary}`);
    }
  }

  if (resolution.nhf.source === 'employee') {
    notes.push(
      `NHF override: ${formatStatutorySummary(resolution.nhf.config)}`,
    );
  }

  if (resolution.nhis.source === 'employee') {
    notes.push(
      `NHIS override: ${formatStatutorySummary(resolution.nhis.config)}`,
    );
  }

  return notes;
}

/**
 * Format the compute engine's per-employee resolution record into short,
 * human-readable notes. Pure presentation — every fact comes from the engine's
 * computed output, never re-derived here.
 */
export function getEmployeeComputationNotes(params: {
  runItem: PayrollRunItem;
  computedItem?: PayrollComputedItem;
}): string[] {
  const { runItem, computedItem } = params;
  const resolution = computedItem?.settingsResolution;
  if (!resolution) {
    return [];
  }

  const notes = getStatutoryOverrideNotes(resolution);

  const rentRelief = computedItem.taxBreakdown?.rentRelief;
  if (rentRelief?.applied) {
    const annualRent = Number.parseFloat(rentRelief.annualRent);
    const relief = Number.parseFloat(rentRelief.reliefAmount);
    notes.push(
      `Rent relief: ${ngnMoneyFormatter(annualRent)}/yr rent → ${ngnMoneyFormatter(relief)} off taxable income`,
    );
  }

  if (
    resolution.state.source === 'employee' &&
    resolution.state.value !== resolution.state.companyDefault
  ) {
    notes.push(
      `Tax state: ${resolution.state.value} (company default: ${resolution.state.companyDefault})`,
    );
  }

  if (resolution.bhtBreakdown.source === 'employee') {
    notes.push('Custom basic / housing / transport split');
  }

  const recurringCount = resolution.appliedRecurringDeductions;
  if (recurringCount > 0) {
    notes.push(
      `${recurringCount} recurring deduction${recurringCount === 1 ? '' : 's'}`,
    );
  }

  const oneOffCount =
    (runItem.edits?.oneOffDeductions?.length ?? 0) +
    (runItem.edits?.oneOffAllowances?.length ?? 0) +
    (runItem.edits?.oneOffEmployerContributions?.length ?? 0);
  if (oneOffCount > 0) {
    notes.push(
      `${oneOffCount} one-off adjustment${oneOffCount === 1 ? '' : 's'} this period`,
    );
  }

  return notes;
}
