import { z } from 'zod';

import { areSameEmployee } from '../compute/employee-matching';
import { PFA_KEYS } from '../data/pfa';
import { NIGERIAN_STATES } from '../data/states';

import type { StateValue } from '../data/states';

/**
 * Tax ruleset key for Nigerian PAYE computation.
 * Currently using 2026 tax bands and rules.
 */
export const TAX_RULESET_KEY = 'NG-2026-v1';

/**
 * Payroll Tool domain model (local-first).
 *
 * Key ideas:
 * - Persist money as decimal strings (avoid floating point drift in JSON).
 * - Keep each payroll run as a self-contained snapshot (reproducible exports).
 * - Optionally keep an employee directory for “reuse next month”.
 */

export const PAYROLL_TOOL_SCHEMA_VERSION = 1 as const;

export const IdSchema = z.uuid();
export const IsoDateSchema = z.iso.date(); // YYYY-MM-DD
export const IsoDateTimeSchema = z.iso.datetime(); // YYYY-MM-DDTHH:mm:ss.sssZ
export const PayrollMonthKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM');

/** Money is stored as a decimal string to avoid floating point drift in persisted JSON. */
export const MoneySchema = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, 'Expected a positive decimal string');

/** Signed money (used in breakdown buckets like reliefs, taxable adjustments, etc.). */
export const SignedMoneySchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,6})?$/, 'Expected a signed decimal string');

export const RateSchema = z.number().min(0).max(1);

/** PFA (Pension Fund Administrator) key schema - validates against official PFA keys.
 * We store by key (stable identifier like 'aiico') rather than name (can change).
 */
export const PfaKeySchema = z.enum(PFA_KEYS);

const MonthRangeSchema = z
  .object({
    fromMonth: PayrollMonthKeySchema,
    toMonth: PayrollMonthKeySchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.toMonth) return;
    if (value.toMonth < value.fromMonth) {
      ctx.addIssue({
        code: 'custom',
        message: '`toMonth` must be >= `fromMonth`',
        path: ['toMonth'],
      });
    }
  });

export const EmployeeIdentitySchema = z
  .object({
    id: IdSchema,
    fullName: z.string().min(1),

    /** Optional employee identifier used by the business/accountant (not the internal UUID). */
    employeeId: z.string().min(1).optional(),
    role: z.string().min(1).optional(),
    department: z.string().min(1).optional(),
    email: z.email().optional(),
    phoneNumber: z.string().min(1).optional(),

    /** Used for prorations later (not required for MVP). */
    joinDate: IsoDateSchema.optional(),
    exitDate: IsoDateSchema.optional(),

    /** Used for bank payment files later (not required for MVP). */
    bankName: z.string().min(1).optional(),
    bankAccountNumber: z
      .string()
      .regex(/^\d{10,20}$/, 'Expected digits only (10–20)')
      .optional(),
    bankAccountName: z.string().min(1).optional(),

    taxId: z.string().min(1).optional(),
    pfa: PfaKeySchema.optional(),
    rsaPin: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.joinDate && value.exitDate && value.exitDate < value.joinDate) {
      ctx.addIssue({
        code: 'custom',
        message: '`exitDate` must be >= `joinDate`',
        path: ['exitDate'],
      });
    }
  });

/**
 * Compensation is stored as annual values so PAYE computations can annualise cleanly.
 *
 * Only `annualGross` is required; the split fields are optional (useful for pension/NHF bases).
 */
export const CompensationPeriodSchema = MonthRangeSchema.extend({
  id: IdSchema,
  annualGross: MoneySchema,
  annualBasic: MoneySchema.optional(),
  annualHousing: MoneySchema.optional(),
  annualTransport: MoneySchema.optional(),
  annualLeaveAllowance: MoneySchema.optional(),
  annualOtherAllowances: MoneySchema.optional(),
  note: z.string().optional(),
});

export const RentPeriodSchema = z.object({
  ...MonthRangeSchema.shape,
  toMonth: PayrollMonthKeySchema,
  id: IdSchema,
  rent: MoneySchema,
  address: z.string().min(1).optional(),
});

/**
 * Validation function to check for overlapping periods
 *
 * Periods overlap if one starts before the other ends.
 * This ensures each month has exactly one applicable period.
 */
function validateNoOverlappingPeriods<
  T extends { id: string; fromMonth: string; toMonth?: string },
>(
  periods: T[],
  periodType: 'compensation' | 'rent',
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  for (let i = 0; i < periods.length; i++) {
    for (let j = i + 1; j < periods.length; j++) {
      const period1 = periods[i];
      const period2 = periods[j];
      const p1Start = period1.fromMonth;
      const p1End = period1.toMonth ?? '9999-12';
      const p2Start = period2.fromMonth;
      const p2End = period2.toMonth ?? '9999-12';

      // Check for overlap: periods overlap if one starts before the other ends
      if (p1Start <= p2End && p2Start <= p1End) {
        ctx.addIssue({
          code: 'custom',
          message: `${periodType === 'compensation' ? 'Compensation' : 'Rent'} periods overlap: period ${period1.id} (${p1Start} to ${p1End}) overlaps with period ${period2.id} (${p2Start} to ${p2End})`,
          path: [...path, j],
        });
      }
    }
  }
}

/**
 * A named money line that can apply to payroll (allowance/deduction/one-off).
 *
 * `taxTreatment` is used instead of a boolean to support special cases like Loss of Employment Benefit.
 */
export const MoneyComponentSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  amount: MoneySchema,
  taxTreatment: z
    .enum([
      'taxable',
      'non_taxable',
      'loss_of_employment_benefit', // Exempt up to N50M
      'death_injury_compensation', // Fully exempt
      'redundancy_payment', // Fully exempt (capital nature)
      'pension_voluntary',
      'nhf_voluntary',
      'nhis_voluntary',
      'owner_occupied_mortgage_interest', // Allowable deduction
      'life_insurance_premium', // Allowable deduction
    ])
    .optional(),
});

/**
 * One-off employer contribution (e.g., voluntary pension top-up, NHIS premium payment).
 * These are employer costs that don't reduce employee net pay but are added to employer cost.
 */
export const EmployerContributionSchema = z.object({
  id: IdSchema,
  type: z.enum(['pension', 'nhis', 'other']),
  name: z.string().min(1),
  amount: MoneySchema,
});

/**
 * Pension can be expressed as rates (preferred) OR explicit monthly amounts (override-friendly).
 * The compute engine should treat amounts as “manual input” and rates as “policy input”.
 */
export const PensionConfigSchema = z
  .object({
    enabled: z.boolean().optional(),

    employeeRate: RateSchema.optional(),
    employerRate: RateSchema.optional(),

    employeeAmount: MoneySchema.optional(),
    employerAmount: MoneySchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.employeeRate != null && value.employeeAmount != null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Set either employeeRate or employeeAmount, not both',
        path: ['employeeAmount'],
      });
    }
    if (value.employerRate != null && value.employerAmount != null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Set either employerRate or employerAmount, not both',
        path: ['employerAmount'],
      });
    }
  });

/**
 * NHF is often computed from a policy rate on Basic; we allow amount overrides for simplicity.
 * If both are omitted, the compute engine should use company policy defaults.
 */
export const NhfConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    employeeRate: RateSchema.optional(),
    employeeAmount: MoneySchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.employeeRate != null && value.employeeAmount != null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Set either employeeRate or employeeAmount, not both',
        path: ['employeeAmount'],
      });
    }
  });

/**
 * NHIS can be expressed as rates (preferred) OR explicit monthly amounts (override-friendly).
 * If both are omitted, the compute engine should use company policy defaults.
 */
export const NhisConfigSchema = z
  .object({
    enabled: z.boolean().optional(),

    employeeRate: RateSchema.optional(),
    employerRate: RateSchema.optional(),

    employeeAmount: MoneySchema.optional(),
    employerAmount: MoneySchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.employeeRate != null && value.employeeAmount != null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Set either employeeRate or employeeAmount, not both',
        path: ['employeeAmount'],
      });
    }
    if (value.employerRate != null && value.employerAmount != null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Set either employerRate or employerAmount, not both',
        path: ['employerAmount'],
      });
    }
  });

/** Nigerian state value schema (e.g., 'Lagos', 'Abuja', 'Kano') */
export const StateSchema = z.enum(NIGERIAN_STATES);

/** Employee payroll defaults (reused month-to-month). */
export const EmployeePayProfileSchema = z.object({
  state: StateSchema.optional(),
  compensationHistory: z
    .array(CompensationPeriodSchema)
    .min(1)
    .superRefine((periods, ctx) => {
      validateNoOverlappingPeriods(periods, 'compensation', ctx, []);
    }),
  rentHistory: z
    .array(RentPeriodSchema)
    .superRefine((rentHistory, ctx) => {
      if (rentHistory && rentHistory.length > 0) {
        validateNoOverlappingPeriods(rentHistory, 'rent', ctx, []);
      }
    })
    .optional(),

  /**
   * Defaults that repeat over time (e.g. loan repayments, union dues).
   * Income/allowances should live inside `compensationHistory` to avoid double counting.
   */
  recurringDeductions: z
    .array(
      MonthRangeSchema.extend({
        id: IdSchema,
        name: z.string().min(1),
        amount: MoneySchema,
        /**
         * Whether this deduction is allowable against taxable income.
         * Use the special values for voluntary statutory add-ons.
         */
        taxTreatment: z
          .enum([
            'non_taxable', // default for most deductions (affects net pay only)
            'taxable', // for edge cases; typically avoid for deductions
            'pension_voluntary',
            'nhf_voluntary',
            'nhis_voluntary',
            'owner_occupied_mortgage_interest', // Interest on loans for owner-occupied residential house
            'life_insurance_premium', // Life insurance premiums (annuity/deferred annuity)
          ])
          .optional(),
      }),
    )
    .optional(),

  pension: PensionConfigSchema.optional(),
  nhf: NhfConfigSchema.optional(),
  nhis: NhisConfigSchema.optional(),
});

/** An employee directory record: identity + payroll defaults. */
export const EmployeeRecordSchema = z.object({
  identity: EmployeeIdentitySchema,
  payProfile: EmployeePayProfileSchema,
});

/** Local employee directory (stored per device/browser unless user signs up). */
export const EmployeeDirectorySchema = z.object({
  schemaVersion: z.literal(PAYROLL_TOOL_SCHEMA_VERSION),
  employeesById: z.record(IdSchema, EmployeeRecordSchema),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const StatutoryDeductionSchema = z.object({
  pension: PensionConfigSchema,
  nhf: NhfConfigSchema,
  nhis: NhisConfigSchema,
});

export const BhtBreakdownSchema = z.object({
  basic: RateSchema.optional(),
  housing: RateSchema.optional(),
  transport: RateSchema.optional(),
});

/**
 * Employment proration method for calculating employment fraction
 *
 * Determines how to calculate the fraction of a month an employee was employed
 * when they join/exit mid-month:
 *
 * - `calendar_days`: Calendar-day proration (default) - uses actual days in month
 * - `thirty_360`: 30-day month proration (30/360-style) - assumes 30 days per month
 * - `business_days`: Business days proration (Mon-Fri only)
 * - `full_month`: Full month - any employment in the month = 1.0, else 0.0
 */
export const EmploymentProrationMethodSchema = z.enum([
  'calendar_days',
  'thirty_360',
  'business_days',
  'full_month',
]);

/** Run-level defaults (applies to this run only). */
export const PayrollRunSettingsSchema = z.object({
  defaultState: StateSchema.default('Lagos'),
  statutoryDeductions: StatutoryDeductionSchema,
  bhtBreakdown: BhtBreakdownSchema,
  /**
   * Employment proration method for calculating employment fraction.
   *
   * Determines how to prorate salary when employees join/exit mid-month.
   * Default: 'calendar_days' (uses actual days in month).
   */
  employmentProrationMethod:
    EmploymentProrationMethodSchema.default('calendar_days'),
  /**
   * Enable rent relief for PAYE computation.
   *
   * When enabled (default: true), rent relief is applied (20% of annual rent, capped at 500k).
   * When disabled, no rent relief is applied regardless of employee rent history.
   */
  enableRentRelief: z.boolean().default(true),
  /**
   * Enable Year-to-Date (YTD) cumulative PAYE computation.
   *
   * When enabled (default: true), PAYE is computed using cumulative income
   * from all finalized runs in the same tax year (Jan..current month).
   * This ensures accurate tax calculation when income fluctuates (e.g., bonuses).
   *
   * When disabled, PAYE is computed on a month-by-month basis without
   * considering prior months' income.
   *
   * This setting is hidden from the UI for now but can be toggled programmatically
   * if needed for edge cases or testing.
   */
  enableYtd: z.boolean().default(true),
});

/**
 * One employee line inside a payroll run.
 * This is a snapshot so exports stay reproducible even if employee defaults change later.
 */
export const PayrollRunItemSchema = z.object({
  id: IdSchema,

  /**
   * Optional link back to the employee directory record (if one exists).
   * Runs must remain reproducible even if employee defaults change later.
   */
  employeeRefId: IdSchema.optional(),

  employeeSnapshot: z.object({
    fullName: z.string().min(1),
    state: StateSchema.optional(),

    employeeId: z.string().min(1).optional(),
    role: z.string().min(1).optional(),
    department: z.string().min(1).optional(),
    email: z.email().optional(),
    phoneNumber: z.string().min(1).optional(),
    joinDate: IsoDateSchema.optional(),
    exitDate: IsoDateSchema.optional(),
    bankName: z.string().min(1).optional(),
    bankAccountNumber: z
      .string()
      .regex(/^\d{10,20}$/, 'Expected digits only (10–20)')
      .optional(),
    bankAccountName: z.string().min(1).optional(),

    taxId: z.string().min(1).optional(),
    pfa: PfaKeySchema.optional(),
    rsaPin: z.string().min(1).optional(),
  }),

  payProfileSnapshot: EmployeePayProfileSchema,

  /**
   * Run-specific adjustments (this month only) such as bonuses, arrears, or termination payments.
   *
   * These DO impact YTD computations as long as each month’s run is saved; cumulative PAYE for a
   * month can be computed by looking at prior saved runs in the same year.
   */
  edits: z
    .object({
      oneOffAllowances: z.array(MoneyComponentSchema).optional(),
      oneOffDeductions: z.array(MoneyComponentSchema).optional(),
      oneOffEmployerContributions: z
        .array(EmployerContributionSchema)
        .optional(),
    })
    .optional(),
});

/**
 * Detailed tax calculation breakdown for explainability and auditability
 */
export const TaxBandBreakdownItemSchema = z.object({
  label: z.string(),
  rate: RateSchema,
  taxableAmount: MoneySchema,
  taxAmount: MoneySchema,
});

export type TaxBandBreakdownItem = z.infer<
  typeof TaxBandBreakdownItemSchema
>;

export const TaxBreakdownSchema = z.object({
  /** Whether YTD calculation was used */
  usedYtd: z.boolean(),

  /** YTD details (only if usedYtd is true) */
  ytd: z
    .object({
      /** Total taxable gross YTD (sum of all months) */
      taxableGrossYtd: MoneySchema,
      /** Total allowable deductions YTD */
      allowableDeductionsYtd: MoneySchema,
      /** Tax already withheld YTD (from prior months) */
      taxWithheldYtd: MoneySchema,
      /** Total worked month units YTD */
      workedMonthUnits: z.number(),
      /** Projected annual gross (from YTD average) */
      projectedAnnualGross: MoneySchema,
      /** Projected annual allowable deductions */
      projectedAnnualAllowableDeductions: MoneySchema,
    })
    .optional(),

  /** Exempt income breakdown */
  exemptIncome: z.object({
    /** Death/injury compensation (fully exempt) */
    deathInjuryCompensation: MoneySchema,
    /** Redundancy payments (fully exempt) */
    redundancyPayment: MoneySchema,
    /** Loss of employment benefit */
    lossOfEmployment: z.object({
      /** Total amount received */
      total: MoneySchema,
      /** Exempt portion (up to N50M) */
      exempt: MoneySchema,
      /** Taxable portion (above N50M) */
      taxable: MoneySchema,
    }),
  }),

  /** Allowable deductions breakdown */
  allowableDeductions: z.object({
    /** Statutory deductions */
    statutory: z.object({
      pension: MoneySchema,
      nhf: MoneySchema,
      nhis: MoneySchema,
    }),
    /** Voluntary contributions (recurring) */
    voluntaryRecurring: z.object({
      pension: MoneySchema,
      nhf: MoneySchema,
      nhis: MoneySchema,
      ownerOccupiedMortgageInterest: MoneySchema,
      lifeInsurancePremium: MoneySchema,
    }),
    /** Voluntary contributions (one-off) */
    voluntaryOneOff: z.object({
      pension: MoneySchema,
      nhf: MoneySchema,
      nhis: MoneySchema,
      ownerOccupiedMortgageInterest: MoneySchema,
      lifeInsurancePremium: MoneySchema,
    }),
    /** Total allowable deductions */
    total: MoneySchema,
  }),

  /** Rent relief details */
  rentRelief: z.object({
    /** Annual rent paid */
    annualRent: MoneySchema,
    /** Rent relief amount (20% capped at 500k) */
    reliefAmount: MoneySchema,
    /** Whether rent relief was applied */
    applied: z.boolean(),
  }),

  /** Tax calculation details */
  taxCalculation: z.object({
    /** Annual taxable income (gross - rent relief - allowable deductions) */
    annualTaxableIncome: MoneySchema,
    /** Annual tax computed */
    annualTax: MoneySchema,
    /** Tax due YTD (if YTD flow) */
    taxDueYtd: MoneySchema.optional(),
    /** Tax already withheld YTD */
    taxWithheldYtd: MoneySchema.optional(),
    /** Current month PAYE */
    currentMonthPaye: MoneySchema,
  }),

  /** One-off allowances breakdown */
  oneOffAllowances: z.object({
    /** Total one-off allowances */
    total: MoneySchema,
    /** Taxable one-off allowances */
    taxable: MoneySchema,
    /** Exempt one-off allowances */
    exempt: MoneySchema,
  }),

  /** Employment details */
  employment: z.object({
    /** Employment fraction (for proration) */
    fraction: z.number(),
    /** Whether proration was applied */
    prorated: z.boolean(),
    /** Proration method used (if prorated) */
    prorationMethod: z.string().optional(),
  }),
  /** Tax band breakdown (optional) */
  taxBandBreakdown: z.array(TaxBandBreakdownItemSchema).optional(),
});

/** Computed result for a single run item (per employee for this run). */
export const PayrollComputedItemSchema = z.object({
  runItemId: IdSchema,

  gross: MoneySchema,
  taxableIncome: MoneySchema.optional(),
  paye: MoneySchema.optional(),

  employeePension: MoneySchema.optional(),
  employerPension: MoneySchema.optional(),
  employeeNhf: MoneySchema.optional(),
  employeeNhis: MoneySchema.optional(),
  employerNhis: MoneySchema.optional(),

  totalDeductions: MoneySchema.optional(),
  netPay: MoneySchema,
  employerCost: MoneySchema.optional(),

  breakdown: z.record(z.string(), SignedMoneySchema).optional(),

  /** Detailed tax breakdown for explainability and auditability */
  taxBreakdown: TaxBreakdownSchema.optional(),
});

/** Run totals across all computed items. */
export const PayrollComputedTotalsSchema = z.object({
  employeeCount: z.number().int().nonnegative(),

  grossTotal: MoneySchema,
  netTotal: MoneySchema,

  payeTotal: MoneySchema.optional(),
  employeePensionTotal: MoneySchema.optional(),
  employerPensionTotal: MoneySchema.optional(),
  nhfTotal: MoneySchema.optional(),
  employeeNhisTotal: MoneySchema.optional(),
  employerNhisTotal: MoneySchema.optional(),
});

/** Computed results for an entire run (company totals + per-employee computed items). */
export const PayrollComputedRunSchema = z.object({
  computedAt: IsoDateTimeSchema,
  periodTotals: PayrollComputedTotalsSchema,
  items: z.array(PayrollComputedItemSchema),
  /**
   * Warnings detected during computation (e.g., incomplete rent data).
   * These are non-blocking but should be shown to users during finalization.
   */
  warnings: z
    .object({
      /**
       * Employees with incomplete rent data (rent periods end before tax year end).
       * Rent relief was computed using extrapolation from last known rent amount.
       */
      incompleteRentData: z.array(z.string()).optional(),
    })
    .optional(),
});

/** Manual overrides applied to computed values for a specific run item (employee). */
export const PayrollOverrideSchema = z.object({
  paye: MoneySchema.optional(),
  employeePension: MoneySchema.optional(),
  employerPension: MoneySchema.optional(),
  employeeNhf: MoneySchema.optional(),
  employeeNhis: MoneySchema.optional(),
  employerNhis: MoneySchema.optional(),
  netPay: MoneySchema.optional(),
  reason: z.string().min(1).optional(),
});

export const PayrollRunOverridesSchema = z.record(
  IdSchema,
  PayrollOverrideSchema,
);

/**
 * A single payroll run (e.g. Jan 2026 for a company, or Q1 2026, or full year 2026).
 * Contains run items, computed outputs, and any overrides.
 *
 * For single-month runs: set `periodMonth` and `periodYear` only.
 * For multi-period runs (quarterly, annual, custom ranges): also set `periodEndMonth` and `periodEndYear`.
 * When `periodEndMonth`/`periodEndYear` are omitted or equal to start, it's treated as a single-month run.
 */
export const PayrollRunSchema = z
  .object({
    schemaVersion: z.literal(PAYROLL_TOOL_SCHEMA_VERSION),
    id: IdSchema,
    companyId: IdSchema.optional(),

    /** A run starts as `draft` (autosaved) and can be marked `final` to lock it. */
    status: z.enum(['draft', 'final']).default('draft'),
    finalizedAt: IsoDateTimeSchema.optional(),

    rulesetKey: z.string().min(1),
    companyName: z.string().min(1),

    /** Period start */
    periodMonth: z.number().int().min(1).max(12),
    periodYear: z.number().int().min(2000).max(2100),

    /**
     * Period end (optional). When omitted or equal to start, run is single-month.
     * When set, enables multi-period runs (e.g., quarterly, annual, custom ranges).
     * Must be >= period start when provided.
     */
    periodEndMonth: z.number().int().min(1).max(12).optional(),
    periodEndYear: z.number().int().min(2000).max(2100).optional(),

    settings: PayrollRunSettingsSchema.optional(),
    items: z.array(PayrollRunItemSchema),

    computed: PayrollComputedRunSchema.optional(),
    overrides: PayrollRunOverridesSchema.optional(),

    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .superRefine((value, ctx) => {
    // If period end is provided, validate it's >= period start
    if (value.periodEndMonth != null && value.periodEndYear != null) {
      const startKey = `${value.periodYear}-${String(value.periodMonth).padStart(2, '0')}`;
      const endKey = `${value.periodEndYear}-${String(value.periodEndMonth).padStart(2, '0')}`;

      if (endKey < startKey) {
        ctx.addIssue({
          code: 'custom',
          message: 'Period end must be >= period start',
          path: ['periodEndMonth'],
        });
        return; // Don't check span if end < start
      }

      // Calculate period span in months (inclusive)
      const startTotalMonths = value.periodYear * 12 + value.periodMonth;
      const endTotalMonths = value.periodEndYear * 12 + value.periodEndMonth;
      const spanMonths = endTotalMonths - startTotalMonths + 1;

      // Limit period to maximum 12 months
      if (spanMonths > 12) {
        ctx.addIssue({
          code: 'custom',
          message: 'Period span cannot exceed 12 months',
          path: ['periodEndMonth'],
        });
      }
    }

    // Validate no duplicate employees in the run
    // Each employee can only appear once per payroll run
    const items = value.items;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (areSameEmployee(items[i], items[j])) {
          const employeeName = items[i].employeeSnapshot.fullName;
          ctx.addIssue({
            code: 'custom',
            message: `Employee "${employeeName}" appears multiple times in this run. Each employee can only appear once per payroll run.`,
            path: ['items', j],
          });
        }
      }
    }
  });

/** Lightweight index entry so we can list runs without loading every run blob. */
export const PayrollRunIndexEntrySchema = z
  .object({
    id: IdSchema,
    companyId: IdSchema.optional(),
    label: z.string().min(1),
    companyName: z.string().min(1),
    periodMonth: z.number().int().min(1).max(12),
    periodYear: z.number().int().min(2000).max(2100),
    periodEndMonth: z.number().int().min(1).max(12).optional(),
    periodEndYear: z.number().int().min(2000).max(2100).optional(),
    status: z.enum(['draft', 'final']).default('draft'),
    finalizedAt: IsoDateTimeSchema.optional(),
    isDemo: z.boolean().optional().default(false),
    updatedAt: IsoDateTimeSchema,
  })
  .superRefine((value, ctx) => {
    // If period end is provided, validate it's >= period start
    if (value.periodEndMonth != null && value.periodEndYear != null) {
      const startKey = `${value.periodYear}-${String(value.periodMonth).padStart(2, '0')}`;
      const endKey = `${value.periodEndYear}-${String(value.periodEndMonth).padStart(2, '0')}`;

      if (endKey < startKey) {
        ctx.addIssue({
          code: 'custom',
          message: 'Period end must be >= period start',
          path: ['periodEndMonth'],
        });
        return; // Don't check span if end < start
      }

      // Calculate period span in months (inclusive)
      const startTotalMonths = value.periodYear * 12 + value.periodMonth;
      const endTotalMonths = value.periodEndYear * 12 + value.periodEndMonth;
      const spanMonths = endTotalMonths - startTotalMonths + 1;

      // Limit period to maximum 12 months
      if (spanMonths > 12) {
        ctx.addIssue({
          code: 'custom',
          message: 'Period span cannot exceed 12 months',
          path: ['periodEndMonth'],
        });
      }
    }
  });

/** Local index of runs stored on this device/browser. */
export const PayrollRunsIndexSchema = z.object({
  schemaVersion: z.literal(PAYROLL_TOOL_SCHEMA_VERSION),
  runs: z.array(PayrollRunIndexEntrySchema),
});

/**
 * Company-level defaults for the tool (local-first).
 * New payroll runs should copy these into `PayrollRun.settings` so runs stay reproducible.
 */
export const PayrollCompanyDefaultsSchema = z.object({
  schemaVersion: z.literal(PAYROLL_TOOL_SCHEMA_VERSION),
  companyId: IdSchema.optional(),
  companyName: z.string().min(1),
  settings: PayrollRunSettingsSchema.optional(),
  updatedAt: IsoDateTimeSchema,
});

export type EmployeeIdentity = z.infer<typeof EmployeeIdentitySchema>;
export type EmployeePayProfile = z.infer<typeof EmployeePayProfileSchema>;
export type EmployeeRecord = z.infer<typeof EmployeeRecordSchema>;
export type EmployeeDirectory = z.infer<typeof EmployeeDirectorySchema>;

export type PayrollRunItem = z.infer<typeof PayrollRunItemSchema>;
export type PayrollRun = z.infer<typeof PayrollRunSchema>;
export type PayrollComputedItem = z.infer<typeof PayrollComputedItemSchema>;
export type PayrollComputedRun = z.infer<typeof PayrollComputedRunSchema>;
export type PayrollRunIndexEntry = z.infer<typeof PayrollRunIndexEntrySchema>;
export type PayrollRunsIndex = z.infer<typeof PayrollRunsIndexSchema>;
export type PayrollCompanyDefaults = z.infer<
  typeof PayrollCompanyDefaultsSchema
>;
export type StatutoryDeduction = z.infer<typeof StatutoryDeductionSchema>;

export function makeNewEmployeeRecord(params: {
  id: string;
  fullName: string;
  state?: StateValue;
  annualGross: string;
  fromMonth: string;
}): EmployeeRecord {
  const employee: EmployeeRecord = {
    identity: { id: params.id, fullName: params.fullName },
    payProfile: {
      state: params.state,
      compensationHistory: [
        {
          id: crypto.randomUUID(),
          fromMonth: params.fromMonth,
          annualGross: params.annualGross,
        },
      ],
    },
  };

  return EmployeeRecordSchema.parse(employee);
}

export function makeNewPayrollRun(params: {
  id: string;
  nowIso: string;
  companyName: string;
  periodMonth: number;
  periodYear: number;
  periodEndMonth?: number;
  periodEndYear?: number;
  companyId?: string;
}): PayrollRun {
  const run: PayrollRun = {
    schemaVersion: PAYROLL_TOOL_SCHEMA_VERSION,
    id: params.id,
    companyId: params.companyId,
    status: 'draft',
    rulesetKey: TAX_RULESET_KEY,
    companyName: params.companyName,
    periodMonth: params.periodMonth,
    periodYear: params.periodYear,
    periodEndMonth: params.periodEndMonth,
    periodEndYear: params.periodEndYear,
    items: [],
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
  };

  return PayrollRunSchema.parse(run);
}

/**
 * Create a PayrollRunItem from an EmployeeRecord
 *
 * This function ensures that employeeRefId is always set from the employee's identity.id.
 * The employeeRefId is critical for matching employees across runs for YTD calculations.
 *
 * @param params - Object containing the run item ID and employee record
 * @returns A PayrollRunItem with employeeRefId set from employee.identity.id
 */
export function makeRunItemFromEmployee(params: {
  id: string;
  employee: EmployeeRecord;
}): PayrollRunItem {
  const { employee } = params;

  // Ensure employee has an identity.id (should always be set)
  if (!employee.identity.id) {
    throw new Error(
      `Employee record must have an identity.id. Employee: ${employee.identity.fullName}`,
    );
  }

  const item: PayrollRunItem = {
    id: params.id,
    employeeRefId: employee.identity.id,
    employeeSnapshot: {
      fullName: employee.identity.fullName,
      state: employee.payProfile.state,

      employeeId: employee.identity.employeeId,
      role: employee.identity.role,
      department: employee.identity.department,
      email: employee.identity.email,
      phoneNumber: employee.identity.phoneNumber,
      joinDate: employee.identity.joinDate,
      exitDate: employee.identity.exitDate,
      bankName: employee.identity.bankName,
      bankAccountNumber: employee.identity.bankAccountNumber,
      bankAccountName: employee.identity.bankAccountName,

      taxId: employee.identity.taxId,
      pfa: employee.identity.pfa,
      rsaPin: employee.identity.rsaPin,
    },
    payProfileSnapshot: employee.payProfile,
  };

  return PayrollRunItemSchema.parse(item);
}
