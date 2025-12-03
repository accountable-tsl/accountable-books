import type { Knex } from 'knex';
import { knexClient } from '../../../db/knexClient.js';
import { ruleScope, type Rules, type RuleScope } from './rules-db.types.js';
import type { RuleEntity } from './rules.types.js';
import type { ActionDefinition, ConditionDefinition } from './rules-def.types.js';

type ScopeTarget =
  | { scope: 'global' }
  | { scope: 'region'; regionCode: string }
  | { scope: 'country'; countryCode: string }
  | { scope: 'subregion'; countryCode: string; subregionCode: string }
  | { scope: 'company'; companyId: string };

export interface RuleFetchParams {
  companyId: string;
  regionCode?: string | null;
  countryCode?: string | null;
  subregionCode?: string | null;
  scopes?: RuleScope[];
  bankAccountId?: string | null;
  includeDisabled?: boolean;
}

/**
 * Represents a row from the 'rules' table joined with 'rule_conditions' and 'rule_actions'.
 * This interface is used internally by the repository to map database results to RuleEntity.
 */
// interface RuleRow {
//   id: string;
//   name: string;
//   scope: RuleScope;
//   region_code: string | null;
//   country_code: string | null;
//   subregion_code: string | null;
//   company_id: string | null;
//   bank_scope: RuleBankScope;
//   bank_account_ids: string[] | null;
//   direction_filter: RuleDirectionFilter;
//   priority: number | null;
//   enabled: boolean;
//   version: number;
//   lock_after_set: boolean;
//   metadata: Record<string, unknown>;
//   tier_rank: number;
//   order_weight: number;
//   scope_key: string;
//   published_at: string | null;
//   published_by: string | null;
//   source: string | null;
//   created_at: string;
//   updated_at: string;
//   condition_definition: unknown;
//   condition_fingerprint: string;
//   condition_summary_text: string | null;
//   condition_field_usage: Record<string, unknown> | null;
//   action_definition: unknown;
//   action_fingerprint: string;
//   protected_action_fields: string[];
// }
type RuleRow = Rules & {
  condition_definition: ConditionDefinition;
  condition_fingerprint: string;
  condition_summary_text?: string | null;
  condition_field_usage?: Record<string, unknown> | null;
  action_definition: ActionDefinition;
  action_fingerprint: string;
  protected_action_fields: string[];
};

const RULES_TABLE = 'rules';
const RULE_CONDITIONS_TABLE = 'rule_conditions';
const RULE_ACTIONS_TABLE = 'rule_actions';

/**
 * RuleRepository handles database interactions for categorization rules.
 * It is responsible for fetching applicable rules based on various criteria
 * and mapping them to `RuleEntity` objects.
 */
export class RuleRepository {
  constructor(private readonly knex: Knex = knexClient) {}

  /**
   * Fetches a list of rules applicable to a given company and transaction context.
   * Rules are filtered by scope, bank account, and enabled status, then ordered
   * by `order_weight` and `version` for deterministic processing.
   * @param params Criteria for fetching rules, including company and geographical IDs.
   * @returns A promise that resolves to an array of `RuleEntity` objects.
   */
  async fetchApplicableRules(params: RuleFetchParams): Promise<RuleEntity[]> {
    // Determine all possible scope keys that could apply to the given company context.
    const scopeKeys = this.deriveScopeKeys(params);

    if (scopeKeys.length === 0) {
      return [];
    }

    // Query the database, joining rules with their conditions and actions.
    const rows = await this.knex
      .from({ r: RULES_TABLE })
      .join({ rc: RULE_CONDITIONS_TABLE }, 'rc.rule_id', '=', 'r.id')
      .join({ ra: RULE_ACTIONS_TABLE }, 'ra.rule_id', '=', 'r.id')
      .select<RuleRow[]>([
        'r.*',
        'rc.definition as condition_definition',
        'rc.fingerprint as condition_fingerprint',
        'rc.summary_text as condition_summary_text',
        'rc.field_usage as condition_field_usage',
        'ra.definition as action_definition',
        'ra.fingerprint as action_fingerprint',
        'r.bank_account_ids', // Explicitly select bank_account_ids after r.*
        // Coalesce protected_action_fields to an empty JSON array if null.
        this.knex.raw(
          "coalesce(to_json(ra.protected_action_fields), '[]'::json) as protected_action_fields",
        ),
      ])
      .where('r.is_deleted', false) // Exclude soft-deleted rules.
      .modify((builder) => {
        // Optionally filter by enabled status.
        if (!params.includeDisabled) {
          builder.where('r.enabled', true);
        }
      })
      .whereIn('r.scope_key', scopeKeys) // Filter rules based on scope.
      .andWhere((builder) => {
        // Filter rules based on bank account scope.
        // 'all' bank scope rules always apply.
        builder.where('r.bank_scope', 'all');
        // If a specific bank account is provided, include rules with 'subset' or 'single'
        // bank scope that match the bank account ID.
        if (params.bankAccountId) {
          builder.orWhere((clause) =>
            clause
              .whereIn('r.bank_scope', ['subset', 'single'])
              .andWhereRaw('? = ANY(r.bank_account_ids)', [
                params.bankAccountId,
              ]),
          );
        }
      })
      // Order rules for deterministic evaluation: by order_weight (tier), then by version (newest first).
      .orderBy('r.order_weight', 'asc')
      .orderBy('r.version', 'desc');

    return rows.map((row: any) => this.mapRowToEntity(row));
  }

  /**
   * Maps a database `RuleRow` object to a `RuleEntity` object.
   * This transforms the flat database row into a structured entity.
   */
  private mapRowToEntity(row: RuleRow): RuleEntity {
    const {
      condition_definition,
      condition_fingerprint,
      condition_summary_text,
      condition_field_usage,

      action_definition,
      action_fingerprint,
      protected_action_fields,
      ...rest
    } = row;
    return {
      ...rest,
      conditions: {
        definition: condition_definition,
        fingerprint: condition_fingerprint,
        summary_text: condition_summary_text,
        field_usage: condition_field_usage,
      },
      actions: {
        definition: action_definition,
        fingerprint: action_fingerprint,
        protected_action_fields: protected_action_fields ?? [],
      },
    };
  }

  /**
   * Derives a list of scope keys based on the provided `RuleFetchParams`.
   * This determines all the geographical and company-specific scope keys that a rule
   * could potentially belong to for the given context.
   *
   * - Context:
   * - Every rule has an auto generated key that's either of the following:
   * - GLOBAL or REGION|<code> or COUNTRY|<code> or SUBREGION|<country-code>|<subregion-code> or COMPANY|<UUID> or UNKNOWN
   * - We try to generate that key based on the provided context to speed up the query.
   * */
  private deriveScopeKeys(params: RuleFetchParams): string[] {
    const keys: string[] = [];
    const regionCode = params.regionCode?.toUpperCase() ?? null;
    const countryCode = params.countryCode?.toUpperCase() ?? null;
    const subregionCode = params.subregionCode?.toUpperCase() ?? null;
    const scopes = params.scopes ?? ruleScope.options;

    for (const scope of scopes) {
      if (scope === 'global') {
        keys.push('GLOBAL');
      }
      if (scope === 'region' && regionCode) {
        keys.push(`REGION|${regionCode}`);
      }
      if (scope === 'country' && countryCode) {
        keys.push(`COUNTRY|${countryCode}`);
      }
      if (scope === 'subregion' && countryCode && subregionCode) {
        keys.push(`SUBREGION|${countryCode}|${subregionCode}`);
      }
      if (scope === 'company') {
        keys.push(`COMPANY|${params.companyId}`);
      }
    }
    return keys;
  }
}
