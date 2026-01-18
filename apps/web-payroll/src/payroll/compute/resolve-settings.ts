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
import type { PayrollRunItem, PayrollRunSettings } from '../domain';

// Type aliases for clarity
type BhtBreakdown = z.infer<typeof BhtBreakdownSchema>;
type NhfConfig = z.infer<typeof NhfConfigSchema>;
type NhisConfig = z.infer<typeof NhisConfigSchema>;
type PensionConfig = z.infer<typeof PensionConfigSchema>;

/**
 * Resolve BHT breakdown with precedence: employee > company > system
 * If no breakdown exists at any level, default to 100% basic (not 0% basic)
 */
export function resolveBhtBreakdown(
  runItem: PayrollRunItem,
  runSettings?: PayrollRunSettings,
  systemDefaults = COMPANY_DEFAULTS.settings,
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
          return {
            basic: basic || undefined,
            housing: housing || undefined,
            transport: transport || undefined,
          };
        }
      }
    }
  }

  // Fallback to company defaults
  if (runSettings?.bhtBreakdown) {
    const breakdown = runSettings.bhtBreakdown;
    if (
      breakdown.basic != null ||
      breakdown.housing != null ||
      breakdown.transport != null
    ) {
      return breakdown;
    }
  }

  // Fallback to system defaults
  if (systemDefaults.bhtBreakdown) {
    return systemDefaults.bhtBreakdown;
  }

  // Default to 100% basic if nothing exists
  return { basic: 1.0 };
}

/**
 * Resolve state with precedence: employee > company > system
 */
export function resolveState(
  runItem: PayrollRunItem,
  runSettings?: PayrollRunSettings,
  systemDefaults = COMPANY_DEFAULTS.settings,
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
 * Resolve NHF config with precedence: employee > company > system
 */
export function resolveNhfConfig(
  runItem: PayrollRunItem,
  runSettings?: PayrollRunSettings,
  systemDefaults = COMPANY_DEFAULTS.settings,
): NhfConfig {
  // Employee-specific NHF config
  if (runItem.payProfileSnapshot.nhf) {
    return runItem.payProfileSnapshot.nhf;
  }

  // Company default
  if (runSettings?.statutoryDeductions?.nhf) {
    return runSettings.statutoryDeductions.nhf;
  }

  // System default
  return systemDefaults.statutoryDeductions.nhf;
}

/**
 * Resolve NHIS config with precedence: employee > company > system
 */
export function resolveNhisConfig(
  runItem: PayrollRunItem,
  runSettings?: PayrollRunSettings,
  systemDefaults = COMPANY_DEFAULTS.settings,
): NhisConfig {
  // Employee-specific NHIS config
  if (runItem.payProfileSnapshot.nhis) {
    return runItem.payProfileSnapshot.nhis;
  }

  // Company default
  if (runSettings?.statutoryDeductions?.nhis) {
    return runSettings.statutoryDeductions.nhis;
  }

  // System default
  return systemDefaults.statutoryDeductions.nhis;
}

/**
 * Resolve Pension config with precedence: employee > company > system
 */
export function resolvePensionConfig(
  runItem: PayrollRunItem,
  runSettings?: PayrollRunSettings,
  systemDefaults = COMPANY_DEFAULTS.settings,
): PensionConfig {
  // Employee-specific Pension config
  if (runItem.payProfileSnapshot.pension) {
    return runItem.payProfileSnapshot.pension;
  }

  // Company default
  if (runSettings?.statutoryDeductions?.pension) {
    return runSettings.statutoryDeductions.pension;
  }

  // System default
  return systemDefaults.statutoryDeductions.pension;
}
