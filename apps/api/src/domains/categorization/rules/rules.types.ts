import type { ContactType } from '../../contacts/contacts.types.js';
import type {
  BaseRuleAction,
  BaseRuleCondition,
  Rules,
} from './rules-db.types.js';
import type { CategorizeLine, SetActionTarget } from './rules-def.types.js';

/**
 * ============================================================
 * Composite Rule Types
 * - Combines DB types with rule definitions
 * - Runtime state and effects
 * ============================================================
 */

/**
 * ============================================================
 * Rule entity: Core shape of a rule as used by the engine & compiler
 * ============================================================
 */
export type RuleEntity = Rules & {
  conditions: BaseRuleCondition;
  actions: BaseRuleAction;
};

/**
 * ============================================================
 * Runtime rule state & effects
 * - Used by engine + compiler
 * ============================================================
 */

export interface RuleDraftState {
  contact?: string; // contact ID
  contact_type?: ContactType; // contact type
  reference?: string;
  description?: string;
  ledger_date?: string;
  categorize?: CategorizeLine[];
}

export type RuleActionEffect =
  | {
      type: 'set';
      target: SetActionTarget;
      value: string;
    }
  | {
      type: 'categorize';
      lines: CategorizeLine[];
    };

export type RuleMutationField = SetActionTarget | 'categorize';
