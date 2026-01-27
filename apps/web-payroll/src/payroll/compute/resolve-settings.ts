import { z } from 'zod';

import { COMPANY_DEFAULTS } from '../data/company-defaults';
import {
  BhtBreakdownSchema,
  NhfConfigSchema,
  NhisConfigSchema,
  PayrollRunSettingsSchema,
  PensionConfigSchema,
} from '../domain';

import type { StateValue } from '../data/states';
import type { PayrollRunItem } from '../domain';

// Infer PayrollRunSettings type from schema
type PayrollRunSettings = z.infer<typeof PayrollRunSettingsSchema>;

// Type aliases for clarity
type BhtBreakdown = z.infer<typeof BhtBreakdownSchema>;
type NhfConfig = z.infer<typeof NhfConfigSchema>;
type NhisConfig = z.infer<typeof NhisConfigSchema>;
type PensionConfig = z.infer<typeof PensionConfigSchema>;

/**
 * Resolved settings for a payroll run item
 *
 * Contains all settings resolved with precedence: employee > company > system
 */
export interface ResolvedSettings {
  bhtBreakdown: BhtBreakdown;
  state: StateValue;
  pension: PensionConfig;
  nhf: NhfConfig;
  nhis: NhisConfig;
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
 * @returns All resolved settings
 */
export function resolveSettings(
  runItem: PayrollRunItem,
  runSettings?: PayrollRunSettings,
  systemDefaults = COMPANY_DEFAULTS.settings!,
): ResolvedSettings {
  return {
    bhtBreakdown: resolveBhtBreakdown(runItem, runSettings, systemDefaults),
    state: resolveState(runItem, runSettings, systemDefaults),
    pension: resolvePensionConfig(runItem, runSettings, systemDefaults),
    nhf: resolveNhfConfig(runItem, runSettings, systemDefaults),
    nhis: resolveNhisConfig(runItem, runSettings, systemDefaults),
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
export function resolveBhtBreakdown(
  runItem: PayrollRunItem,
  runSettings?: PayrollRunSettings,
  systemDefaults = COMPANY_DEFAULTS.settings!,
): BhtBreakdown {
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
          return normalizeBhtBreakdown({
            basic: basic || undefined,
            housing: housing || undefined,
            transport: transport || undefined,
          });
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
      return normalizeBhtBreakdown(breakdown);
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
      return normalizeBhtBreakdown(systemBreakdown);
    }
    // If system breakdown exists but is empty {}, fall through to default
  }

  return { basic: 1.0 };
}

/**
 * Resolve state with precedence: employee > company > system
 */
export function resolveState(
  runItem: PayrollRunItem,
  runSettings?: PayrollRunSettings,
  systemDefaults = COMPANY_DEFAULTS.settings!,
): StateValue {
  // Employee-specific state
  if (runItem.payProfileSnapshot.state) {
    return runItem.payProfileSnapshot.state;
  }

  // Company default
  if (runSettings?.defaultState) {
    return runSettings.defaultState;
  }

  // System default
  return systemDefaults.defaultState || 'Lagos';
}

/**
 * Generic helper to resolve a statutory deduction config with precedence: employee > company > system
 *
 * @param runItem - The payroll run item
 * @param runSettings - Optional run-level settings
 * @param systemDefaults - System-wide defaults (must be provided)
 * @param employeePath - Path to employee-specific config (e.g., 'nhf', 'nhis', 'pension')
 * @param defaultConfig - Default config to return if nothing is found
 * @returns Resolved config
 */
function resolveStatutoryConfig<
  T extends NhfConfig | NhisConfig | PensionConfig,
>(
  runItem: PayrollRunItem,
  runSettings: PayrollRunSettings | undefined,
  systemDefaults: NonNullable<typeof COMPANY_DEFAULTS.settings>,
  employeePath: 'nhf' | 'nhis' | 'pension',
  defaultConfig: T,
): T {
  // Employee-specific config
  const employeeConfig = runItem.payProfileSnapshot[employeePath];
  if (employeeConfig) {
    return employeeConfig as T;
  }

  // Company default
  const companyConfig = runSettings?.statutoryDeductions?.[employeePath];
  if (companyConfig) {
    return companyConfig as T;
  }

  // System default
  const systemConfig = systemDefaults?.statutoryDeductions?.[employeePath];
  if (systemConfig) {
    return systemConfig as T;
  }

  // Fallback to provided default (shouldn't happen if defaults are set correctly)
  return defaultConfig;
}

/**
 * Resolve NHF config with precedence: employee > company > system
 */
export function resolveNhfConfig(
  runItem: PayrollRunItem,
  runSettings?: PayrollRunSettings,
  systemDefaults = COMPANY_DEFAULTS.settings!,
): NhfConfig {
  return resolveStatutoryConfig(
    runItem,
    runSettings,
    systemDefaults,
    'nhf',
    systemDefaults.statutoryDeductions.nhf,
  );
}

/**
 * Resolve NHIS config with precedence: employee > company > system
 */
export function resolveNhisConfig(
  runItem: PayrollRunItem,
  runSettings?: PayrollRunSettings,
  systemDefaults = COMPANY_DEFAULTS.settings!,
): NhisConfig {
  return resolveStatutoryConfig(
    runItem,
    runSettings,
    systemDefaults,
    'nhis',
    systemDefaults.statutoryDeductions.nhis,
  );
}

/**
 * Resolve Pension config with precedence: employee > company > system
 */
export function resolvePensionConfig(
  runItem: PayrollRunItem,
  runSettings?: PayrollRunSettings,
  systemDefaults = COMPANY_DEFAULTS.settings!,
): PensionConfig {
  return resolveStatutoryConfig(
    runItem,
    runSettings,
    systemDefaults,
    'pension',
    systemDefaults.statutoryDeductions.pension,
  );
}
