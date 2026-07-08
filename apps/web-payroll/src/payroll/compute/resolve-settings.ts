import { z } from 'zod';

import { COMPANY_DEFAULTS } from '../data/company-defaults';
import {
  BhtBreakdownSchema,
  NhfConfigSchema,
  NhisConfigSchema,
  PensionConfigSchema,
} from '../domain';

import type { StateValue } from '../data/states';
import type {
  PayrollRunItem,
  PayrollRunSettings,
  SettingSource,
} from '../domain';

// Type aliases for clarity
type BhtBreakdown = z.infer<typeof BhtBreakdownSchema>;
type NhfConfig = z.infer<typeof NhfConfigSchema>;
type NhisConfig = z.infer<typeof NhisConfigSchema>;
type PensionConfig = z.infer<typeof PensionConfigSchema>;

type SystemDefaults = NonNullable<typeof COMPANY_DEFAULTS.settings>;

/**
 * Resolved settings for a payroll run item
 *
 * Contains all settings resolved with precedence: employee > company > system,
 * plus where each value came from so computed output can explain itself.
 */
export interface ResolvedSettings {
  bhtBreakdown: BhtBreakdown;
  state: StateValue;
  pension: PensionConfig;
  nhf: NhfConfig;
  nhis: NhisConfig;
  sources: {
    bhtBreakdown: SettingSource;
    state: SettingSource;
    pension: SettingSource;
    nhf: SettingSource;
    nhis: SettingSource;
  };
  /** State that applies when the employee has no override (company > system). */
  companyDefaultState: StateValue;
  /** Whether pension is enabled at company/system level, ignoring the employee override. */
  companyPensionEnabled: boolean;
}

/**
 * Resolve all settings for a run item with precedence: employee > company > system
 *
 * This is the unified function that resolves all settings at once, avoiding
 * multiple passes through the same data structure.
 *
 * @param runItem - The payroll run item
 * @param runSettings - Optional run-level settings (company defaults)
 * @param systemDefaults - System-wide defaults (defaults to COMPANY_DEFAULTS.settings)
 * @returns All resolved settings with their sources
 */
export function resolveSettings(
  runItem: PayrollRunItem,
  runSettings?: PayrollRunSettings,
  systemDefaults = COMPANY_DEFAULTS.settings!,
): ResolvedSettings {
  const bht = resolveBhtBreakdown(runItem, runSettings, systemDefaults);
  const state = resolveState(runItem, runSettings, systemDefaults);
  const pension = resolveStatutoryConfig(
    runItem,
    runSettings,
    systemDefaults,
    'pension',
    systemDefaults.statutoryDeductions.pension,
  );
  const nhf = resolveStatutoryConfig(
    runItem,
    runSettings,
    systemDefaults,
    'nhf',
    systemDefaults.statutoryDeductions.nhf,
  );
  const nhis = resolveStatutoryConfig(
    runItem,
    runSettings,
    systemDefaults,
    'nhis',
    systemDefaults.statutoryDeductions.nhis,
  );
  const companyPension =
    runSettings?.statutoryDeductions?.pension ??
    systemDefaults.statutoryDeductions.pension;

  return {
    bhtBreakdown: bht.value,
    state: state.value,
    pension: pension.config,
    nhf: nhf.config,
    nhis: nhis.config,
    sources: {
      bhtBreakdown: bht.source,
      state: state.source,
      pension: pension.source,
      nhf: nhf.source,
      nhis: nhis.source,
    },
    companyDefaultState: state.companyDefault,
    companyPensionEnabled: companyPension?.enabled !== false,
  };
}

function normalizeBhtBreakdown(breakdown: BhtBreakdown): BhtBreakdown {
  const basic = breakdown.basic ?? 0;
  const housing = breakdown.housing ?? 0;
  const transport = breakdown.transport ?? 0;
  const total = basic + housing + transport;

  if (total <= 1 || total === 0) {
    return breakdown;
  }

  const scale = 1 / total;
  return {
    basic: breakdown.basic != null ? basic * scale : undefined,
    housing: breakdown.housing != null ? housing * scale : undefined,
    transport: breakdown.transport != null ? transport * scale : undefined,
  };
}

/**
 * Resolve BHT breakdown with precedence: employee > company > system
 * If no breakdown exists at any level, default to 100% basic (not 0% basic)
 */
function resolveBhtBreakdown(
  runItem: PayrollRunItem,
  runSettings: PayrollRunSettings | undefined,
  systemDefaults: SystemDefaults,
): { value: BhtBreakdown; source: SettingSource } {
  // Check employee-specific breakdown in compensation history
  const compHistory = runItem.payProfileSnapshot.compensationHistory;
  if (compHistory.length > 0) {
    const comp = compHistory[0];
    // Check if employee has explicit annualBasic, annualHousing, annualTransport
    // If they do, we can infer the breakdown
    if (
      comp.annualBasic != null ||
      comp.annualHousing != null ||
      comp.annualTransport != null
    ) {
      const annualGross = parseFloat(comp.annualGross);
      if (annualGross > 0) {
        const basic = comp.annualBasic
          ? parseFloat(comp.annualBasic) / annualGross
          : 0;
        const housing = comp.annualHousing
          ? parseFloat(comp.annualHousing) / annualGross
          : 0;
        const transport = comp.annualTransport
          ? parseFloat(comp.annualTransport) / annualGross
          : 0;

        // If we have explicit values, return them as rates
        if (basic > 0 || housing > 0 || transport > 0) {
          return {
            value: normalizeBhtBreakdown({
              basic: basic || undefined,
              housing: housing || undefined,
              transport: transport || undefined,
            }),
            source: 'employee',
          };
        }
      }
    }
  }

  // Fallback to company defaults
  if (runSettings?.bhtBreakdown) {
    const breakdown = runSettings.bhtBreakdown;
    // Check if breakdown has at least one defined value (not just an empty object)
    if (
      breakdown.basic != null ||
      breakdown.housing != null ||
      breakdown.transport != null
    ) {
      return { value: normalizeBhtBreakdown(breakdown), source: 'company' };
    }
    // If breakdown exists but is empty {}, fall through to system defaults
  }

  // Fallback to system defaults
  if (systemDefaults?.bhtBreakdown) {
    const systemBreakdown = systemDefaults.bhtBreakdown;
    // Check if system breakdown has at least one defined value
    if (
      systemBreakdown.basic != null ||
      ('housing' in systemBreakdown && systemBreakdown.housing != null) ||
      ('transport' in systemBreakdown && systemBreakdown.transport != null)
    ) {
      return {
        value: normalizeBhtBreakdown(systemBreakdown),
        source: 'system',
      };
    }
    // If system breakdown exists but is empty {}, fall through to default
  }

  return { value: { basic: 1.0 }, source: 'system' };
}

/**
 * Resolve state with precedence: employee > company > system
 */
function resolveState(
  runItem: PayrollRunItem,
  runSettings: PayrollRunSettings | undefined,
  systemDefaults: SystemDefaults,
): { value: StateValue; source: SettingSource; companyDefault: StateValue } {
  const companyDefault =
    runSettings?.defaultState ?? systemDefaults.defaultState ?? 'Lagos';

  // Employee-specific state
  if (runItem.payProfileSnapshot.state) {
    return {
      value: runItem.payProfileSnapshot.state,
      source: 'employee',
      companyDefault,
    };
  }

  return {
    value: companyDefault,
    source: runSettings?.defaultState ? 'company' : 'system',
    companyDefault,
  };
}

/**
 * Generic helper to resolve a statutory deduction config with precedence: employee > company > system
 *
 * @param runItem - The payroll run item
 * @param runSettings - Optional run-level settings
 * @param systemDefaults - System-wide defaults (must be provided)
 * @param employeePath - Path to employee-specific config (e.g., 'nhf', 'nhis', 'pension')
 * @param defaultConfig - Default config to return if nothing is found
 * @returns Resolved config and where it came from
 */
function resolveStatutoryConfig<
  T extends NhfConfig | NhisConfig | PensionConfig,
>(
  runItem: PayrollRunItem,
  runSettings: PayrollRunSettings | undefined,
  systemDefaults: SystemDefaults,
  employeePath: 'nhf' | 'nhis' | 'pension',
  defaultConfig: T,
): { config: T; source: SettingSource } {
  // Employee-specific config
  const employeeConfig = runItem.payProfileSnapshot[employeePath];
  if (employeeConfig) {
    return { config: employeeConfig as T, source: 'employee' };
  }

  // Company default
  const companyConfig = runSettings?.statutoryDeductions?.[employeePath];
  if (companyConfig) {
    return { config: companyConfig as T, source: 'company' };
  }

  // System default
  const systemConfig = systemDefaults?.statutoryDeductions?.[employeePath];
  if (systemConfig) {
    return { config: systemConfig as T, source: 'system' };
  }

  // Fallback to provided default (shouldn't happen if defaults are set correctly)
  return { config: defaultConfig, source: 'system' };
}
