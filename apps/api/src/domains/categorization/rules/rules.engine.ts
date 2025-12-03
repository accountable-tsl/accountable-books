import { randomUUID } from 'crypto';
import { performance } from 'node:perf_hooks';
import type { RuleRepository } from './rules.repository.js';
import { RuleCompiler } from './rules.compiler.js';
import type {
  CompiledAction,
  CompiledCondition,
} from './rules.compiler.js';
import type {
  ActionTraceNode,
  ConditionTraceNode,
} from './rules-def.types.js';
import {
  type RuleEntity,
  type RuleDraftState,
  type RuleMutationField,
} from './rules.types.js';
import { RuleRepository as DefaultRuleRepository } from './rules.repository.js';
import type {
  RuleEngineInput,
  RuleEngineResult,
  RuleTransactionContext,
} from './rules.engine.types.js';
import { ruleDirectionFilter, type RuleLogStatus } from './rules-db.types.js';
import type { RuleLogDraft } from './rule-logs.types.js';
import {
  RuleLogRepository as DefaultRuleLogRepository,
  type RuleLogWriter,
} from './rule-logs.repository.js';

/**
 * The RulesEngine is responsible for processing a single transaction against a
 * set of categorization rules. It is designed to be a stateless, deterministic
 * processor that can be run in isolation.
 *
 * The engine follows these steps:
 * - Fetch all applicable rules for the given company and transaction context.
 * - Compile the rules' conditions and actions into executable functions.
 * - Evaluate the rules in a deterministic order of priority.
 * - If a rule's conditions are met, execute its actions to mutate a draft state.
 * - Detect and handle conflicts, such as a rule trying to modify a field that
 *    has been locked by a higher-priority rule.
 * - Log the outcome of each rule evaluation for auditing and debugging.
 */
export class RulesEngine {
  private readonly compiler: RuleCompiler;
  private readonly repository: RuleRepository;
  private readonly logWriter: RuleLogWriter;

  constructor(
    repository: RuleRepository = new DefaultRuleRepository(),
    compiler: RuleCompiler = new RuleCompiler(),
    logWriter: RuleLogWriter = new DefaultRuleLogRepository(),
  ) {
    this.repository = repository;
    this.compiler = compiler;
    this.logWriter = logWriter;
  }

  /**
   * Runs the rules engine for a single transaction.
   * @param input The input containing the transaction, company context, and options.
   * @returns A promise that resolves to the result of the engine run.
   */
  async run(input: RuleEngineInput): Promise<RuleEngineResult> {
    const { transaction, company, options } = input;
    const runId = options?.runId ?? randomUUID();
    const debugMode = options?.debug ?? false;

    // Fetch all rules that could possibly apply to this transaction.
    const rules = await this.repository.fetchApplicableRules({
      companyId: company.companyId,
      regionCode: company.regionCode,
      countryCode: company.countryCode,
      subregionCode: company.subregionCode,
      bankAccountId: transaction.bankAccountId ?? null,
      includeDisabled: options?.includeDisabledRules ?? false,
      scopes: options?.scopes,
    });

    const logs: RuleLogDraft[] = [];
    const debugLogs: RuleLogDraft[] = [];
    let draftState: RuleDraftState = {};
    const lockedFields = new Set<RuleMutationField>();
    const exclusiveClaims = new Map<string, string>();
    let status: RuleEngineResult['status'] = 'no_match';
    let needsReview = false;
    const appliedRuleIds: string[] = [];
    let conflictingField: string | null = null;

    // Evaluate the rules in a deterministic order.
    for (const entity of rules) {
      const start = performance.now();
      const isSystemRule = (entity.source ?? '').toLowerCase() === 'system';
      let condition: CompiledCondition;
      let action: CompiledAction;

      try {
        condition = this.compiler.compileCondition(
          entity.conditions.fingerprint,
          entity.conditions.definition,
          { allowRegex: isSystemRule, allowSignals: isSystemRule },
        );
        action = this.compiler.compileAction(
          entity.actions.fingerprint,
          entity.actions.definition,
          { allowTemplates: isSystemRule },
        );
      } catch (error) {
        needsReview = true;
        if (status !== 'applied') {
          status = 'error';
        }
        logs.push(
          this.buildLogDraft({
            entity,
            status: 'error',
            matchedConditions: [],
            appliedActions: [],
            resultState: this.cloneState(draftState),
            immutableFieldsAfterRule: Array.from(lockedFields),
            durationMs: performance.now() - start,
            errorMessage: (error as Error).message,
            note: 'compile_failed',
          }),
        );
        continue;
      }

      // Skip rules that don't match the transaction's direction (inflow/outflow).
      if (
        !this.directionMatches(entity.direction_filter, transaction.direction)
      ) {
        if (debugMode) {
          debugLogs.push(
            this.buildLogDraft({
              entity,
              status: 'skipped',
              matchedConditions: [],
              appliedActions: [],
              resultState: this.cloneState(draftState),
              immutableFieldsAfterRule: Array.from(lockedFields),
              durationMs: performance.now() - start,
              note: 'direction_mismatch',
            }),
          );
        }
        continue;
      }

      // Evaluate the rule's conditions.
      const conditionResult = condition.evaluate(transaction);
      if (!conditionResult.matched) {
        if (debugMode) {
          debugLogs.push(
            this.buildLogDraft({
              entity,
              status: 'skipped',
              matchedConditions: conditionResult.trace,
              appliedActions: [],
              resultState: this.cloneState(draftState),
              immutableFieldsAfterRule: Array.from(lockedFields),
              durationMs: performance.now() - start,
              note: 'condition_not_met',
            }),
          );
        }
        continue;
      }

      // Detect and handle conflicts.
      const touchedFields = action.touchedFields;
      const lockedViolation = touchedFields.find((field) =>
        lockedFields.has(field),
      );
      if (lockedViolation) {
        needsReview = true;
        status = 'conflict';
        conflictingField = lockedViolation;
        logs.push(
          this.buildLogDraft({
            entity,
            status: 'conflict',
            matchedConditions: conditionResult.trace,
            appliedActions: [],
            resultState: this.cloneState(draftState),
            immutableFieldsAfterRule: Array.from(lockedFields),
            conflictingField: lockedViolation,
            durationMs: performance.now() - start,
          }),
        );
        break; // Stop processing further rules on conflict.
      }

      const protectedFieldConflict = this.detectExclusiveConflict(
        exclusiveClaims,
        entity,
        touchedFields,
      );

      if (protectedFieldConflict) {
        needsReview = true;
        status = 'conflict';
        conflictingField = protectedFieldConflict;
        logs.push(
          this.buildLogDraft({
            entity,
            status: 'conflict',
            matchedConditions: conditionResult.trace,
            appliedActions: [],
            resultState: this.cloneState(draftState),
            immutableFieldsAfterRule: Array.from(lockedFields),
            conflictingField: protectedFieldConflict,
            durationMs: performance.now() - start,
          }),
        );
        break; // Stop processing further rules on conflict.
      }

      // Execute the rule's actions and update the draft state.
      try {
        const actionResult = action.execute(draftState, transaction);
        draftState = actionResult.nextDraft;
        if (entity.lock_after_set) {
          actionResult.touchedFields.forEach((field) =>
            lockedFields.add(field),
          );
        }
        this.claimProtectedFields(
          exclusiveClaims,
          entity,
          entity.actions.protected_action_fields ?? [],
        );

        appliedRuleIds.push(entity.id);
        status = 'applied';
        logs.push(
          this.buildLogDraft({
            entity,
            status: 'success',
            matchedConditions: conditionResult.trace,
            appliedActions: actionResult.trace,
            resultState: this.cloneState(draftState),
            immutableFieldsAfterRule: entity.lock_after_set
              ? Array.from(actionResult.touchedFields)
              : null,
            durationMs: performance.now() - start,
          }),
        );
      } catch (error) {
        needsReview = true;
        status = 'error';
        logs.push(
          this.buildLogDraft({
            entity,
            status: 'error',
            matchedConditions: conditionResult.trace,
            appliedActions: [],
            resultState: this.cloneState(draftState),
            immutableFieldsAfterRule: Array.from(lockedFields),
            errorMessage: (error as Error).message,
            durationMs: performance.now() - start,
          }),
        );
        break; // Stop processing on error.
      }
    }

    await this.persistLogs({
      runId,
      companyId: company.companyId,
      transactionId: transaction.transactionId,
      transactionDate: transaction.transactionDate,
      logs,
      debugLogs: debugMode ? debugLogs : undefined,
    });

    const finalState = this.cloneState(draftState);

    return {
      runId,
      transactionId: transaction.transactionId,
      transactionDate: transaction.transactionDate,
      logs,
      finalState,
      status,
      appliedRuleIds,
      needsReview,
      conflictingField,
      debugLogs: debugMode ? debugLogs : undefined,
    };
  }

  private async persistLogs(params: {
    runId: string;
    companyId: string;
    transactionId: string;
    transactionDate: string;
    logs: RuleLogDraft[];
    debugLogs?: RuleLogDraft[];
  }): Promise<void> {
    const {
      runId,
      companyId,
      transactionId,
      transactionDate,
      logs,
      debugLogs,
    } = params;

    if (!logs.length && !(debugLogs && debugLogs.length)) {
      return;
    }

    try {
      await this.logWriter.persistRunLogs({
        context: { runId, companyId, transactionId, transactionDate },
        logs,
        debugLogs,
      });
    } catch (error) {
      throw new Error(`RulesEngine failed to persist logs for run ${runId}`, {
        cause: error,
      });
    }
  }

  /**
   * Checks if the rule's direction filter matches the transaction's direction.
   */
  private directionMatches(
    filter: RuleEntity['direction_filter'],
    direction: RuleTransactionContext['direction'],
  ): boolean {
    if (filter === ruleDirectionFilter.enum.all) {
      return true;
    }
    return filter === direction;
  }

  /**
   * Detects if a rule is trying to modify a field that is protected by another
   * rule at the same priority level.
   */
  private detectExclusiveConflict(
    claims: Map<string, string>,
    rule: RuleEntity,
    touchedFields: RuleMutationField[],
  ): string | null {
    const protectedFields = rule.actions.protected_action_fields ?? [];
    if (protectedFields.length === 0) {
      return null;
    }

    for (const field of protectedFields) {
      if (!touchedFields.includes(field as RuleMutationField)) {
        continue;
      }
      const key = this.exclusiveKey(rule.scope, rule.priority ?? 0, field);
      const owner = claims.get(key);
      if (owner && owner !== rule.id) {
        return field;
      }
    }
    return null;
  }

  /**
   * Claims protected fields for a rule, preventing other rules at the same
   * priority level from modifying them.
   */
  private claimProtectedFields(
    claims: Map<string, string>,
    rule: RuleEntity,
    fields: string[],
  ): void {
    for (const field of fields) {
      const key = this.exclusiveKey(rule.scope, rule.priority ?? 0, field);
      claims.set(key, rule.id);
    }
  }

  /**
   * Creates a unique key for a protected field based on its scope, priority,
   * and field name.
   */
  private exclusiveKey(
    scope: RuleEntity['scope'],
    priority: number,
    field: string,
  ) {
    return `${scope}:${priority}:${field}`;
  }

  /**
   * Creates a deep clone of the draft state to prevent mutations from leaking
   * between rule evaluations.
   */
  private cloneState(state: RuleDraftState): RuleDraftState {
    return {
      ...state,
      categorize: state.categorize
        ? state.categorize.map((line) => ({ ...line }))
        : undefined,
    };
  }

  /**
   * Builds a log entry for a rule evaluation.
   */
  private buildLogDraft(params: {
    entity: RuleEntity;
    status: RuleLogStatus;
    matchedConditions?: ConditionTraceNode[];
    appliedActions?: ActionTraceNode[];
    resultState: RuleDraftState;
    immutableFieldsAfterRule?: RuleMutationField[] | null;
    conflictingField?: string | null;
    durationMs: number;
    errorMessage?: string | null;
    note?: string;
  }): RuleLogDraft {
    const {
      entity,
      status,
      matchedConditions,
      appliedActions,
      resultState,
      immutableFieldsAfterRule,
      conflictingField,
      durationMs,
      errorMessage,
      note,
    } = params;
    return {
      ruleId: entity.id,
      ruleName: entity.name,
      ruleScope: entity.scope,
      ruleVersion: entity.version,
      rulePriority: entity.priority,
      conditionFingerprint: entity.conditions.fingerprint,
      actionFingerprint: entity.actions.fingerprint,
      status,
      matchedConditions,
      appliedActions,
      resultState,
      immutableFieldsAfterRule,
      conflictingField,
      durationMs,
      errorMessage,
      note,
    };
  }
}

export const rulesEngine = new RulesEngine();
