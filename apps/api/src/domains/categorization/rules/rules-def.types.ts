import z from 'zod';

/**
 * ============================================================
 * Rule Definitions - Pure Type Definitions
 * - Condition definitions (WHEN a rule fires)
 * - Action definitions (WHAT a rule does)
 * - Trace types (Explainability for logs)
 * ============================================================
 * This file has NO imports from other rules files to break circular deps.
 * Only imports: Zod for schemas
 */

/**
 * ============================================================
 * Condition definitions (WHEN a rule fires)
 * - User-facing + system-only condition schemas
 * ============================================================
 */

// String conditions (description, reference, payee, etc.)
const stringOperators = z.enum([
  'equals',
  'contains',
  'is_blank',
  'starts_with',
  'regex', // not shown to users
]);
const stringFields = z.enum([
  'description',
  'reference',
  'payee',
  'any_text_field',
]);
const stringCondition = z.object({
  type: z.literal('string'),
  field: stringFields,
  operator: stringOperators,
  value: z.string(),
});

// Amount conditions (numeric comparisons on amount)
const amountOperators = z.enum(['equals', 'gt', 'lt', 'gte', 'lte']);
const amountCondition = z.object({
  type: z.literal('amount'),
  field: z.literal('amount'),
  operator: amountOperators,
  value: z.number(),
});

// Date conditions (date equals/after/between)
const dateOperators = z.enum(['equals', 'after', 'between']);
const dateCondition = z.discriminatedUnion('operator', [
  z.object({
    type: z.literal('date'),
    operator: z.enum(['equals', 'after']),
    field: z.literal('date'),
    value: z.iso.date(),
  }),
  z.object({
    type: z.literal('date'),
    operator: z.literal('between'),
    field: z.literal('date'),
    start: z.iso.date(),
    end: z.iso.date(),
  }),
]);

// Signal conditions (boolean-like enrichment flags)
const signalFields = z.enum([
  'likely_split',
  'likely_trf_btw_accounts',
  'requires_vat_check',
  'requires_fx_review',
]);
const signalCondition = z.object({
  type: z.literal('signal'),
  field: signalFields,
  operator: z.enum(['is_true', 'is_false']).default('is_true'),
});

// Union of all condition types
const conditions = z.discriminatedUnion('type', [
  stringCondition,
  amountCondition,
  dateCondition,
  signalCondition,
]);

export const conditionDefinition = z.object({
  logic: z.enum(['all', 'any']),
  conditions: z.array(conditions).min(1, 'At least one condition is required'),
});

// Condition type exports
export type StringCondition = z.infer<typeof stringCondition>;
export type AmountCondition = z.infer<typeof amountCondition>;
export type DateCondition = z.infer<typeof dateCondition>;
export type ConditionDefinition = z.infer<typeof conditionDefinition>;
export type SignalCondition = z.infer<typeof signalCondition>;

/**
 * ============================================================
 * Action definitions (WHAT a rule does)
 * - set, categorize, apply_template
 * ============================================================
 */
export const actionTypes = z.enum(['set', 'categorize', 'apply_template']); // maybe rename categorize to split
export const setActionTargets = z.enum([
  'contact',
  'reference',
  'description', // description is a special field that can be set by a rule
  'ledger_date',
]);

const setAction = z.object({
  type: z.literal('set'),
  target: setActionTargets,
  value: z.string(),
});

// Categorize: defines journal split logic

// For categorize line, if split_type is amount or percentage<1, we must have at least two categorize objs
// and for percentage, sum must equal 1
const categorizeLine = z.discriminatedUnion('split_type', [
  z.object({
    split_type: z.literal('percentage'),
    description: z.string(),
    coa_id: z.uuid(),
    value: z.number().positive().max(1),
    // explanation: z.string().optional(),
  }),
  z.object({
    split_type: z.literal('amount'),
    description: z.string(),
    coa_id: z.uuid(),
    value: z.number().positive(),
    // explanation: z.string().optional(),
  }),
  z.object({
    split_type: z.literal('remainder'),
    description: z.string(),
    coa_id: z.uuid(),
    // explanation: z.string().optional(),
  }),
]);

const categorizeAction = z
  .object({
    type: z.literal('categorize'),
    lines: z.array(categorizeLine).min(1),
  })
  .superRefine((a, ctx) => {
    const lines = a.lines;
    const percentageLines = lines.filter((l) => l.split_type === 'percentage');
    const amtLines = lines.filter((l) => l.split_type === 'amount');
    const remainderLines = lines.filter((l) => l.split_type === 'remainder');

    // at least 2 lines if any amount or any percentage < 1
    const hasAmount = amtLines.length > 0;
    const hasLowPercLine = percentageLines.some((p) => p.value < 1);

    if ((hasAmount || hasLowPercLine) && lines.length < 2) {
      ctx.addIssue({
        code: 'custom',
        message:
          'We must have at least two lines when split_type is amount or percentage < 100%',
      });
    }

    // Check percentage sum
    const percentageSum = percentageLines.reduce((t, l) => t + l.value, 0);
    const percSumEquals1 = Math.abs(percentageSum - 1) < 1e-6;
    if (
      remainderLines.length === 0 &&
      percentageLines.length > 0 &&
      !percSumEquals1
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `Percentages must sum to 1.0 (currently: ${percentageSum})`,
      });
    }

    if (remainderLines.length === 1 && percentageSum >= 1 - 1e-6) {
      ctx.addIssue({
        code: 'custom',
        message: `With remainder, percentages must sum to < 1 (got ${percentageSum})`,
      });
    }

    if (remainderLines.length > 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'Only one remainder line allowed',
      });
    }

    // no duplicate COA targets
    const coas = lines.map((l) => l.coa_id);
    if (new Set(coas).size !== coas.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Duplicate coa_id in categorize lines',
      });
    }
  });

// Template-based actions (system-defined patterns)
const templateNames = z.enum(['vat_split']);

const applyTemplateAction = z.object({
  type: z.literal('apply_template'),
  template: templateNames,
  params: z.record(z.string(), z.any()).optional(),
});

// Full action definition
export const actionDefinition = z.object({
  actions: z
    .array(
      z.discriminatedUnion('type', [
        setAction,
        categorizeAction,
        applyTemplateAction,
      ]),
    )
    .min(1),
});

// Action type exports
export type SetAction = z.infer<typeof setAction>;
export type SetActionTarget = z.infer<typeof setActionTargets>;
export type CategorizeLine = z.infer<typeof categorizeLine>;
export type CategorizeAction = z.infer<typeof categorizeAction>;
export type ActionDefinition = z.infer<typeof actionDefinition>;
export type ApplyTemplateAction = z.infer<typeof applyTemplateAction>;
export type TemplateName = z.infer<typeof templateNames>;

/**
 * ============================================================
 * Trace types (explainability)
 * - Per-condition and per-action traces used in logs & metadata
 * ============================================================
 */

// How each condition was evaluated
export const conditionTraceNode = z.object({
  index: z.number(), // The position of the condition in the rule's condition list.
  kind: z.enum(['string', 'amount', 'date', 'signal']),
  field: z.string(), // The field that was evaluated.
  operator: z.string(), // The comparison operator that was used (e.g equals, greater_than, etc).
  expected: z.any().nullish(), // The expected value from the rule
  actual: z.any().nullish(), // The actual value from the transaction
  success: z.boolean(), // Whether the condition matched or not
});

// How each action was executed
export const actionTraceNode = z.object({
  type: z.enum(['set', 'categorize', 'template']),
  target: setActionTargets.optional(),
  value: z.string().nullish(),
  lineCount: z.number().optional(),
  template: templateNames.optional(),
});

export type ConditionTraceNode = z.infer<typeof conditionTraceNode>;
export type ActionTraceNode = z.infer<typeof actionTraceNode>;
