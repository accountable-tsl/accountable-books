import z from 'zod';
import { dbBaseFields, dbStandardFields } from '../../../core/index.js';
import {
  createCamelCaseSchema,
  type SnakeToCamelCaseObject,
} from '../../../shared/index.js';
import { actionDefinition, conditionDefinition } from './rules-def.types.js';

// Rules
export const ruleScope = z.enum([
  'global',
  'region',
  'country',
  'subregion',
  'company',
]);
export type RuleScope = z.infer<typeof ruleScope>;

export const ruleDirectionFilter = z.enum([
  'all',
  'inflow',
  'outflow',
  'transfer',
]);
export type RuleDirectionFilter = z.infer<typeof ruleDirectionFilter>;

export const ruleBankScope = z.enum(['all', 'subset', 'single']);
export type RuleBankScope = z.infer<typeof ruleBankScope>;

const ruleSource = z.enum(['company', 'system']);
export type RuleSource = z.infer<typeof ruleSource>;

export const newRuleInput = z.object({
  name: z.string().min(1).max(200),
  scope: ruleScope,
  region_code: z.string().nullable(),
  country_code: z.string().nullable(),
  subregion_code: z.string().nullable(),
  company_id: z.string().nullable(),
  bank_scope: ruleBankScope,
  bank_account_ids: z.array(z.string()).nullable(),
  direction_filter: ruleDirectionFilter,
  priority: z.number().nullish(),
  enabled: z.boolean().default(true).optional(),
  lock_after_set: z.boolean().default(false).optional(),
  published_at: z.iso.datetime().nullish(),
  published_by: z.string().nullish(),
  source: ruleSource.default('company').nullish(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type NewRuleInput = z.infer<typeof newRuleInput>;
export const newRuleInputCamel = createCamelCaseSchema(newRuleInput);
export type NewRuleInputCamel = SnakeToCamelCaseObject<
  z.infer<typeof newRuleInputCamel>
>;

export const newRule = z.object({
  ...newRuleInput.shape,
  priority: z.number().default(0),
  enabled: z.boolean().default(true),
  lock_after_set: z.boolean().default(false),
  published_at: z.iso.datetime().nullable(),
  published_by: z.string().nullable(),
  source: ruleSource.default('company').nullable(),

  version: z.number().default(1),
  created_by_id: z.string(),
  updated_by_id: z.string().nullable(),

  ...dbBaseFields.shape,
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export type NewRule = z.infer<typeof newRule>;

export const rules = z.object({
  ...newRule.shape,
  tier_rank: z.int(),
  order_weight: z.int(),
  scope_key: z.string(),
});
export type Rules = z.infer<typeof rules>;

// RuleConditions
const baseRuleCondition = z.object({
  definition: conditionDefinition,
  fingerprint: z.string().length(64),
  summary_text: z.string().nullish(),
  field_usage: z.record(z.string(), z.unknown()).nullish(),
});
export type BaseRuleCondition = z.infer<typeof baseRuleCondition>;
export type BaseRuleConditionCamel = SnakeToCamelCaseObject<
  z.infer<typeof baseRuleCondition>
>;

export const newRuleCondition = z.object({
  ...baseRuleCondition.shape,
  id: z.uuid().optional(),
});

export const ruleConditions = z.object({
  ...newRuleCondition.shape,
  id: z.uuid(),
});
export type RuleConditions = z.infer<typeof ruleConditions>;
export const ruleConditionsCamel = createCamelCaseSchema(ruleConditions);

// RuleActions
const baseRuleAction = z.object({
  definition: actionDefinition,
  fingerprint: z.string().length(64),
  protected_action_fields: z.array(z.string()),
});
export const newRuleAction = z.object({
  ...baseRuleAction.shape,
  id: z.uuid().optional(),
  rule_id: z.uuid(),
});
export const ruleActions = z.object({
  id: z.uuid(),
});

export type BaseRuleAction = z.infer<typeof baseRuleAction>;
export type NewRuleAction = z.infer<typeof newRuleAction>;
export type RuleActions = z.infer<typeof ruleActions>;

export const ruleActionsCamel = createCamelCaseSchema(ruleActions);
export type RuleActionsCamel = SnakeToCamelCaseObject<
  z.infer<typeof ruleActionsCamel>
>;

// RuleLogs
export const ruleLogStatus = z.enum([
  'success',
  'conflict',
  'skipped',
  'error',
]);
export type RuleLogStatus = z.infer<typeof ruleLogStatus>;

export const ruleLogs = z.object({
  id: z.string(),
  engine_run_id: z.string(),
  company_id: z.string(),
  rule_id: z.string(),
  transaction_id: z.string(),
  transaction_date: z.string(),
  rule_version: z.number(),
  rule_priority: z.number().nullable(),
  rule_scope: ruleScope,
  rule_name: z.string().max(200),
  condition_fingerprint: z.string().length(64).nullable(),
  action_fingerprint: z.string().length(64).nullable(),
  matched_conditions: z.record(z.string(), z.any()).nullable(),
  applied_actions: z.record(z.string(), z.any()).nullable(),
  txn_hash_before: z.string().nullable(),
  txn_hash_after: z.string().nullable(),
  result_state: z.record(z.string(), z.any()),
  error_message: z.string().nullable(),
  immutable_fields_after_rule: z.array(z.string()).nullable(),
  conflicting_field: z.string().nullable(),
  debug_payload: z.record(z.string(), z.any()).nullable(),
  status: ruleLogStatus,
  executed_at: z.string(),
  duration_ms: z.number().nullable(),
});
export type RuleLogs = z.infer<typeof ruleLogs>;
export const ruleLogsCamel = createCamelCaseSchema(ruleLogs);
export type RuleLogsCamel = SnakeToCamelCaseObject<
  z.infer<typeof ruleLogsCamel>
>;
