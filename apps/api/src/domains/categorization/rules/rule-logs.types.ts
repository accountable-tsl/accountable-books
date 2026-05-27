import type { RuleLogStatus } from './rules-db.types.js';
import type { ActionTraceNode, ConditionTraceNode } from './rules-def.types.js';
import type {
  RuleDraftState,
  RuleEntity,
  RuleMutationField,
} from './rules.types.js';

export interface RuleLogDraft {
  ruleId: string;
  ruleName: string;
  ruleScope: RuleEntity['scope'];
  ruleVersion: number;
  rulePriority: number | null;
  conditionFingerprint: string;
  actionFingerprint: string;
  status: RuleLogStatus;
  matchedConditions?: ConditionTraceNode[];
  appliedActions?: ActionTraceNode[];
  resultState: RuleDraftState;
  immutableFieldsAfterRule?: RuleMutationField[] | null;
  conflictingField?: string | null;
  durationMs?: number;
  errorMessage?: string | null;
  note?: string;
}

export interface RuleLogPersistContext {
  runId: string;
  companyId: string;
  transactionId: string;
  transactionDate: string; // YYYY-MM-DD
}
