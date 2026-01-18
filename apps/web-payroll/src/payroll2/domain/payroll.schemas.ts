import { z } from 'zod';

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
    pfaName: z.string().min(1).optional(),
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
  annualGross: MoneySchema,
  annualBasic: MoneySchema.optional(),
  annualHousing: MoneySchema.optional(),
  annualTransport: MoneySchema.optional(),
  annualLeaveAllowance: MoneySchema.optional(),
  annualOtherAllowances: MoneySchema.optional(),
});

export const RentPeriodSchema = MonthRangeSchema.extend({
  annualRent: MoneySchema,
  address: z.string().min(1).optional(),
});

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
      'loss_of_employment_benefit',
      'pension_voluntary',
      'nhf_voluntary',
      'nhis_voluntary',
    ])
    .optional(),
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

/** Employee payroll defaults (reused month-to-month). */
export const EmployeePayProfileSchema = z.object({
  state: z.string().min(1).optional(),
  compensationHistory: z.array(CompensationPeriodSchema).min(1),
  rentHistory: z.array(RentPeriodSchema).optional(),

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

/** Run-level defaults (applies to this run only). */
export const PayrollRunSettingsSchema = z.object({
  defaultState: z.string().min(1).optional(),
  pension: PensionConfigSchema.optional(),
  nhf: NhfConfigSchema.optional(),
  nhis: NhisConfigSchema.optional(),
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
    state: z.string().min(1).optional(),

    employeeId: z.string().min(1).optional(),
    role: z.string().min(1).optional(),
    department: z.string().min(1).optional(),
    joinDate: IsoDateSchema.optional(),
    exitDate: IsoDateSchema.optional(),
    bankName: z.string().min(1).optional(),
    bankAccountNumber: z
      .string()
      .regex(/^\d{10,20}$/, 'Expected digits only (10–20)')
      .optional(),
    bankAccountName: z.string().min(1).optional(),

    taxId: z.string().min(1).optional(),
    pfaName: z.string().min(1).optional(),
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
    })
    .optional(),
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
  totals: PayrollComputedTotalsSchema,
  items: z.array(PayrollComputedItemSchema),
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
 * A single payroll run (e.g. Jan 2026 for a company).
 * Contains run items, computed outputs, and any overrides.
 */
export const PayrollRunSchema = z.object({
  schemaVersion: z.literal(PAYROLL_TOOL_SCHEMA_VERSION),
  id: IdSchema,

  /** A run starts as `draft` (autosaved) and can be marked `final` to lock it. */
  status: z.enum(['draft', 'final']).default('draft'),
  finalizedAt: IsoDateTimeSchema.optional(),

  rulesetKey: z.string().min(1),
  companyName: z.string().min(1),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2000).max(2100),

  settings: PayrollRunSettingsSchema.optional(),
  items: z.array(PayrollRunItemSchema),

  computed: PayrollComputedRunSchema.optional(),
  overrides: PayrollRunOverridesSchema.optional(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

/** Lightweight index entry so we can list runs without loading every run blob. */
export const PayrollRunIndexEntrySchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  companyName: z.string().min(1),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2000).max(2100),
  status: z.enum(['draft', 'final']).default('draft'),
  finalizedAt: IsoDateTimeSchema.optional(),
  updatedAt: IsoDateTimeSchema,
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
  companyName: z.string().min(1).optional(),
  settings: PayrollRunSettingsSchema.optional(),
  updatedAt: IsoDateTimeSchema,
});

export type EmployeeIdentity = z.infer<typeof EmployeeIdentitySchema>;
export type EmployeePayProfile = z.infer<typeof EmployeePayProfileSchema>;
export type EmployeeRecord = z.infer<typeof EmployeeRecordSchema>;
export type EmployeeDirectory = z.infer<typeof EmployeeDirectorySchema>;

export type PayrollRunItem = z.infer<typeof PayrollRunItemSchema>;
export type PayrollRun = z.infer<typeof PayrollRunSchema>;
export type PayrollComputedRun = z.infer<typeof PayrollComputedRunSchema>;
export type PayrollRunIndexEntry = z.infer<typeof PayrollRunIndexEntrySchema>;
export type PayrollRunsIndex = z.infer<typeof PayrollRunsIndexSchema>;
export type PayrollCompanyDefaults = z.infer<typeof PayrollCompanyDefaultsSchema>;

export function makeNewEmployeeRecord(params: {
  id: string;
  fullName: string;
  state?: string;
  annualGross: string;
  fromMonth: string;
}): EmployeeRecord {
  const employee: EmployeeRecord = {
    identity: { id: params.id, fullName: params.fullName },
    payProfile: {
      state: params.state,
      compensationHistory: [
        {
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
  rulesetKey: string;
  companyName: string;
  periodMonth: number;
  periodYear: number;
}): PayrollRun {
  const run: PayrollRun = {
    schemaVersion: PAYROLL_TOOL_SCHEMA_VERSION,
    id: params.id,
    status: 'draft',
    rulesetKey: params.rulesetKey,
    companyName: params.companyName,
    periodMonth: params.periodMonth,
    periodYear: params.periodYear,
    items: [],
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
  };

  return PayrollRunSchema.parse(run);
}

export function makeRunItemFromEmployee(params: {
  id: string;
  employee: EmployeeRecord;
}): PayrollRunItem {
  const { employee } = params;

  const item: PayrollRunItem = {
    id: params.id,
    employeeRefId: employee.identity.id,
    employeeSnapshot: {
      fullName: employee.identity.fullName,
      state: employee.payProfile.state,

      employeeId: employee.identity.employeeId,
      role: employee.identity.role,
      department: employee.identity.department,
      joinDate: employee.identity.joinDate,
      exitDate: employee.identity.exitDate,
      bankName: employee.identity.bankName,
      bankAccountNumber: employee.identity.bankAccountNumber,
      bankAccountName: employee.identity.bankAccountName,

      taxId: employee.identity.taxId,
      pfaName: employee.identity.pfaName,
      rsaPin: employee.identity.rsaPin,
    },
    payProfileSnapshot: employee.payProfile,
  };

  return PayrollRunItemSchema.parse(item);
}
