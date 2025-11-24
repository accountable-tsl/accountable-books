import {
  type CategorizeLine,
  type SetActionTarget,
} from './rules-def.types.js';
import type {
  BaseRuleAction,
  RuleBankScope,
  BaseRuleCondition,
  RuleDirectionFilter,
  RuleScope,
  Rules,
} from './rules-db.types.js';

export type RuleEntity = Rules & {
  conditions: BaseRuleCondition;
  actions: BaseRuleAction;
};
// export interface RuleEntity {
//   id: string;
//   name: string;
//   scope: RuleScope;
//   regionCode: string | null;
//   countryCode: string | null;
//   subregionCode: string | null;
//   companyId: string | null;
//   bankScope: RuleBankScope;
//   bankAccountIds: string[] | null;
//   directionFilter: RuleDirectionFilter;
//   priority: number | null;
//   enabled: boolean;
//   version: number;
//   lockAfterSet: boolean;
//   metadata: Record<string, unknown>;
//   tierRank: number;
//   orderWeight: number;
//   scopeKey: string;
//   publishedAt: string | null;
//   publishedBy: string | null;
//   source: string | null;
//   createdAt: string;
//   updatedAt: string;
//   condition: BaseRuleConditionCamel;
//   action: BaseRuleAction;
// }

export interface RuleDraftState {
  contact?: string;
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
