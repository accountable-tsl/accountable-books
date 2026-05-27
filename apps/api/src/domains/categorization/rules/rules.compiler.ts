import { LRUCache } from 'lru-cache';

import { toYMD } from '../../../shared/index.js';
import { actionDefinition, conditionDefinition } from './rules-def.types.js';
import { getActionTemplate } from './rules.templates.js';
import {
  type RuleActionEffect,
  type RuleDraftState,
  type RuleMutationField,
} from './rules.types.js';

import type {
  ActionDefinition,
  ActionTraceNode,
  AmountCondition,
  ApplyTemplateAction,
  CategorizeLine,
  ConditionDefinition,
  ConditionTraceNode,
  DateCondition,
  SetActionTarget,
  SignalCondition,
  StringCondition,
} from './rules-def.types.js';
import type { RuleTransactionContext } from './rules.engine.types.js';

const FLOAT_TOLERANCE = 1e-6;

// Quick note: keep compiled rules in-memory (LRU) because:
// - Speed: calling a local function (no network) is far faster than a Redis lookup.
// - Not serializable: compiled conditions/actions are JS functions (closures)
//   and cannot be reliably serialized and restored from Redis.
// - Staleness risk: storing executable state in Redis makes invalidation
//   harder when rules change. Use Redis only for small, serializable data
//   (e.g. parsed JSON), not for executable closures.

/**
 * Custom error class for RuleCompiler specific errors.
 */
export class RuleCompilerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleCompilerError';
  }
}

/**
 * The result of evaluating a compiled condition, including whether it matched
 * and a detailed trace of the evaluation.
 */
export interface ConditionEvaluationResult {
  matched: boolean;
  trace: ConditionTraceNode[];
}

/**
 * Represents a compiled condition, ready for efficient evaluation.
 * Includes a fingerprint for caching and an evaluate function.
 */
export interface CompiledCondition {
  fingerprint: string;
  evaluate(txn: RuleTransactionContext): ConditionEvaluationResult;
}

/**
 * The result of executing a compiled action, including the next draft state,
 * the effects of the action, and a detailed trace of the execution.
 */
export interface ActionExecutionResult {
  nextDraft: RuleDraftState;
  effects: RuleActionEffect[];
  touchedFields: RuleMutationField[];
  trace: ActionTraceNode[];
}

/**
 * Represents a compiled action, ready for efficient execution.
 * Includes a fingerprint for caching and an execute function.
 */
export interface CompiledAction {
  fingerprint: string;
  execute(
    currentDraft: RuleDraftState,
    txn: RuleTransactionContext,
  ): ActionExecutionResult;
  touchedFields: RuleMutationField[];
}

type ConditionNodeEvaluator = (
  txn: RuleTransactionContext,
) => ConditionTraceNode;

interface CompileConditionOptions {
  allowRegex?: boolean;
  allowSignals?: boolean;
}

interface CompileActionOptions {
  allowTemplates?: boolean;
}

interface ActionNodeExecutor {
  touchedFields: RuleMutationField[];
  run(
    state: RuleDraftState,
    txn: RuleTransactionContext,
  ): { next: RuleDraftState; effect: RuleActionEffect; trace: ActionTraceNode };
}

/**
 * The RuleCompiler is responsible for taking raw rule definitions (JSON objects)
 * and compiling them into efficient, executable JavaScript functions.
 * It uses caching to avoid recompiling frequently used rules.
 */
export class RuleCompiler {
  private readonly conditionCache = new LRUCache<string, CompiledCondition>({
    max: 1000,
    ttl: 1000 * 60 * 60, // 1 hour
  });
  private readonly actionCache = new LRUCache<string, CompiledAction>({
    max: 1000,
    ttl: 1000 * 60 * 60,
  });

  /**
   * Compiles a condition definition into an executable `CompiledCondition`.
   * Caches the compiled condition for future use based on its fingerprint.
   * @param fingerprint A unique identifier for the condition definition.
   * @param definition The raw JSON definition of the condition.
   * @param options Options for compilation, e.g., whether to allow regex.
   * @returns A `CompiledCondition` object.
   * @throws {RuleCompilerError} if the definition is invalid or regex is used when not allowed.
   */
  compileCondition(
    fingerprint: string,
    definition: ConditionDefinition,
    options?: CompileConditionOptions,
  ): CompiledCondition {
    const allowRegex = options?.allowRegex ?? false;
    const allowSignals = options?.allowSignals ?? false;
    const cacheKey = this.conditionCacheKey(
      fingerprint,
      allowRegex,
      allowSignals,
    );
    const cached = this.conditionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const parsed = conditionDefinition.parse(definition);
    if (!allowRegex && this.containsRegexCondition(parsed)) {
      throw new RuleCompilerError(
        'Regex operators are restricted to system rules',
      );
    }
    if (!allowSignals && this.containsSignalCondition(parsed)) {
      throw new RuleCompilerError(
        'Signal conditions are restricted to system rules',
      );
    }
    const compiled = this.buildConditionEvaluator(parsed, fingerprint);
    this.conditionCache.set(cacheKey, compiled);
    return compiled;
  }

  /**
   * Compiles an action definition into an executable `CompiledAction`.
   * Caches the compiled action for future use based on its fingerprint.
   * @param fingerprint A unique identifier for the action definition.
   * @param definition The raw JSON definition of the action.
   * @returns A `CompiledAction` object.
   * @throws {ZodError} if the definition is invalid.
   */
  compileAction(
    fingerprint: string,
    definition: ActionDefinition,
    options?: CompileActionOptions,
  ): CompiledAction {
    const allowTemplates = options?.allowTemplates ?? false;
    const cacheKey = this.actionCacheKey(fingerprint, allowTemplates);
    const cached = this.actionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const parsed = actionDefinition.parse(definition);
    const compiled = this.buildActionExecutor(parsed, fingerprint, {
      allowTemplates,
    });
    this.actionCache.set(cacheKey, compiled);
    return compiled;
  }

  /**
   * Builds the core evaluation logic for a group of conditions.
   * It creates an array of individual condition evaluators and combines them
   * based on the group's logic ('all' or 'any').
   */
  private buildConditionEvaluator(
    group: ConditionDefinition,
    fingerprint: string,
  ): CompiledCondition {
    const evaluators = group.conditions.map((condition, index) => {
      switch (condition.type) {
        case 'string':
          return this.buildStringConditionEvaluator(condition, index);
        case 'amount':
          return this.buildAmountConditionEvaluator(condition, index);
        case 'date':
          return this.buildDateConditionEvaluator(condition, index);
        case 'signal':
          return this.buildSignalConditionEvaluator(condition, index);
      }
    });

    return {
      fingerprint,
      evaluate: (txn) => {
        const trace: ConditionTraceNode[] = [];
        if (group.logic === 'all') {
          // For 'all' logic, all conditions must match. Short-circuits on first failure.
          for (const evaluator of evaluators) {
            const result = evaluator(txn);
            trace.push(result);
            if (!result.success) {
              return { matched: false, trace };
            }
          }
          return { matched: true, trace };
        }

        // For 'any' logic, at least one condition must match. Short-circuits on first success.
        let matched = false;
        for (const evaluator of evaluators) {
          const result = evaluator(txn);
          trace.push(result);
          if (result.success) {
            matched = true;
            break;
          }
        }
        return { matched, trace };
      },
    };
  }

  /**
   * Builds an evaluator function for a single string condition.
   * Handles different string operators like 'equals', 'contains', 'is_blank', etc.
   */
  private buildStringConditionEvaluator(
    condition: StringCondition,
    index: number,
  ): ConditionNodeEvaluator {
    const normalizedExpected =
      condition.operator === 'regex'
        ? condition.value
        : condition.value.toLowerCase();

    const compiledRegex =
      condition.operator === 'regex'
        ? this.compileRegex(condition.value)
        : null;

    return (txn) => {
      const values = this.collectStringFieldValues(txn, condition.field);
      let success = false;

      if (condition.operator === 'is_blank') {
        // For 'any_text_field', checks if ANY of the fields are blank.
        // For specific fields, checks if THAT field is blank.
        success =
          condition.field === 'any_text_field'
            ? values.some((value) => value.trim().length === 0)
            : values.every((value) => value.trim().length === 0);
      } else if (condition.operator === 'regex' && compiledRegex) {
        success = values.some((value) => compiledRegex.test(value));
      } else if (condition.operator === 'equals') {
        success = values.some(
          (value) => value.toLowerCase() === normalizedExpected,
        );
      } else if (condition.operator === 'contains') {
        success = values.some((value) =>
          value.toLowerCase().includes(normalizedExpected),
        );
      } else if (condition.operator === 'starts_with') {
        success = values.some((value) =>
          value.toLowerCase().startsWith(normalizedExpected),
        );
      }

      return {
        index,
        kind: 'string' as const,
        field: condition.field,
        operator: condition.operator,
        expected: condition.value,
        actual:
          condition.field === 'any_text_field'
            ? {
                description: this.nullableToString(txn.description),
                reference: this.nullableToString(txn.reference),
                payee: this.nullableToString(txn.payee),
              }
            : (values[0] ?? ''),
        success,
      };
    };
  }

  /**
   * Builds an evaluator function for a single amount condition.
   * Handles different amount operators like 'equals', 'gt', 'lt', etc.
   */
  private buildAmountConditionEvaluator(
    condition: AmountCondition,
    index: number,
  ): ConditionNodeEvaluator {
    return (txn) => {
      const amount = txn.amount ?? 0;
      const expected = condition.value;
      let success = false;

      switch (condition.operator) {
        case 'equals':
          success = Math.abs(amount - expected) < FLOAT_TOLERANCE;
          break;
        case 'gt':
          success = amount > expected;
          break;
        case 'gte':
          success =
            amount >= expected || Math.abs(amount - expected) < FLOAT_TOLERANCE;
          break;
        case 'lt':
          success = amount < expected;
          break;
        case 'lte':
          success =
            amount <= expected || Math.abs(amount - expected) < FLOAT_TOLERANCE;
          break;
      }

      return {
        index,
        kind: 'amount' as const,
        field: 'amount',
        operator: condition.operator,
        expected: condition.value,
        actual: amount,
        success,
      };
    };
  }

  private buildSignalConditionEvaluator(
    condition: SignalCondition,
    index: number,
  ): ConditionNodeEvaluator {
    return (txn) => {
      const signals = (txn.metadata as Record<string, unknown> | undefined)
        ?.signals as Record<string, unknown> | undefined;
      const actual = Boolean(signals?.[condition.field]);
      const expectTrue = condition.operator === 'is_true';
      const success = expectTrue ? actual : !actual;
      return {
        index,
        kind: 'signal' as const,
        field: condition.field,
        operator: condition.operator,
        expected: expectTrue,
        actual,
        success,
      };
    };
  }

  /**
   * Builds an evaluator function for a single date condition.
   * Handles different date operators like 'equals', 'after', 'between'.
   */
  private buildDateConditionEvaluator(
    condition: DateCondition,
    index: number,
  ): ConditionNodeEvaluator {
    // The 'between' operator has a different structure for its value (start/end dates).
    if (condition.operator === 'between') {
      // const startTs = this.toTimestamp(condition.start);
      // const endTs = this.toTimestamp(condition.end);
      const startTs = toYMD(condition.start);
      const endTs = toYMD(condition.end);
      return (txn) => {
        const txnTs = toYMD(txn.transactionDate);
        const success = txnTs >= startTs && txnTs <= endTs;
        return {
          index,
          kind: 'date' as const,
          field: 'date',
          operator: 'between',
          expected: { start: condition.start, end: condition.end },
          actual: txn.transactionDate,
          success,
        };
      };
    }

    // For 'equals' and 'after' operators, the value is a single date.
    const referenceTs = this.toTimestamp(condition.value);
    const op = condition.operator;
    return (txn) => {
      const txnTs = this.toTimestamp(txn.transactionDate);
      let success = false;
      if (op === 'equals') {
        success = referenceTs === txnTs;
      } else if (op === 'after') {
        success = txnTs > referenceTs;
      }
      return {
        index,
        kind: 'date' as const,
        field: 'date',
        operator: op,
        expected: condition.value,
        actual: txn.transactionDate,
        success,
      };
    };
  }

  /**
   * Builds the core execution logic for a group of actions.
   * It creates an array of individual action executors.
   */
  private buildActionExecutor(
    group: ActionDefinition,
    fingerprint: string,
    options: CompileActionOptions,
  ): CompiledAction {
    const executors = group.actions.map((action) => {
      if (action.type === 'set') {
        return this.buildSetActionExecutor(action);
      }
      if (action.type === 'categorize') {
        return this.buildCategorizeExecutor(action.lines);
      }
      if (!options.allowTemplates) {
        throw new RuleCompilerError(
          'Action templates are restricted to system rules',
        );
      }
      return this.buildTemplateExecutor(action);
    });

    // Collect all fields that any action in this group might touch.
    const uniqueTouched = Array.from(
      new Set(executors.flatMap((exec) => exec.touchedFields)),
    );

    return {
      fingerprint,
      touchedFields: uniqueTouched,
      execute: (currentDraft, txn) => {
        let nextDraft: RuleDraftState = { ...currentDraft };
        const effects: RuleActionEffect[] = [];
        const trace: ActionTraceNode[] = [];

        // Execute each action sequentially, updating the draft state.
        for (const executor of executors) {
          const {
            next,
            effect,
            trace: nodeTrace,
          } = executor.run(nextDraft, txn);
          nextDraft = next;
          effects.push(effect);
          trace.push(nodeTrace);
        }

        return {
          nextDraft,
          effects,
          trace,
          touchedFields: uniqueTouched,
        };
      },
    };
  }

  /**
   * Builds an executor function for a 'set' action, which modifies a single
   * scalar field in the draft state.
   */
  private buildSetActionExecutor(action: {
    type: 'set';
    target: SetActionTarget;
    value: string;
  }): ActionNodeExecutor {
    const targetKey = action.target;
    return {
      touchedFields: [targetKey], // This action touches only one field.
      run: (state) => {
        const next: RuleDraftState = { ...state, [targetKey]: action.value };
        return {
          next,
          effect: {
            type: 'set',
            target: action.target,
            value: action.value,
          },
          trace: {
            type: 'set',
            target: action.target,
            value: action.value,
          },
        };
      },
    };
  }

  /**
   * Builds an executor function for a 'categorize' action, which manages
   * the split lines for categorization.
   */
  private buildCategorizeExecutor(lines: CategorizeLine[]): ActionNodeExecutor {
    return {
      touchedFields: ['categorize'], // This action touches the 'categorize' field.
      run: (state) => {
        // Deep clone the lines to ensure immutability.
        const nextLines = lines.map((line) => ({ ...line }));
        const next: RuleDraftState = { ...state, categorize: nextLines };
        return {
          next,
          effect: {
            type: 'categorize',
            lines: nextLines,
          },
          trace: {
            type: 'categorize',
            lineCount: nextLines.length,
          },
        };
      },
    };
  }

  private buildTemplateExecutor(
    action: ApplyTemplateAction,
  ): ActionNodeExecutor {
    const template = getActionTemplate(action.template);
    return {
      touchedFields: ['categorize'],
      run: (state, txn) => {
        const result = template({
          params: action.params ?? {},
          txn,
        });
        const nextLines = result.lines.map((line) => ({ ...line }));
        const next: RuleDraftState = { ...state, categorize: nextLines };
        return {
          next,
          effect: {
            type: 'categorize',
            lines: nextLines,
          },
          trace: {
            type: 'template',
            template: action.template,
            lineCount: nextLines.length,
          },
        };
      },
    };
  }

  /**
   * Collects the string values from the transaction context for a given field.
   * Handles the special 'any_text_field' case by collecting all relevant text fields.
   */
  private collectStringFieldValues(
    txn: RuleTransactionContext,
    field: StringCondition['field'],
  ): string[] {
    if (field === 'any_text_field') {
      return [
        this.nullableToString(txn.description),
        this.nullableToString(txn.reference),
        this.nullableToString(txn.payee),
      ];
    }

    if (field === 'description') {
      return [this.nullableToString(txn.description)];
    }
    if (field === 'reference') {
      return [this.nullableToString(txn.reference)];
    }
    if (field === 'payee') {
      return [this.nullableToString(txn.payee)];
    }
    return [''];
  }

  /**
   * Converts a nullable string to an empty string if null or undefined.
   */
  private nullableToString(value?: string | null): string {
    return value ?? '';
  }

  /**
   * Compiles a regex pattern string into a RegExp object.
   * Throws an error if the pattern is invalid.
   */
  private compileRegex(pattern: string): RegExp {
    try {
      return new RegExp(pattern, 'i');
    } catch (error) {
      throw new RuleCompilerError(
        `Invalid regex pattern "${pattern}": ${(error as Error).message}`,
      );
    }
  }

  /**
   * Converts an ISO date string to a Unix timestamp.
   * Throws an error if the date string is invalid.
   */
  private toTimestamp(value: string): number {
    const ts = Date.parse(value);
    if (Number.isNaN(ts)) {
      throw new RuleCompilerError(`Invalid date value "${value}"`);
    }
    return ts;
  }

  /**
   * Enforces a maximum size for the cache, removing the oldest entry if the limit is exceeded.
   */
  // Eviction is handled by the in-process LRU cache (lru-cache).

  /**
   * Generates a cache key for a compiled condition, incorporating whether regex/signals are allowed.
   */
  private conditionCacheKey(
    fingerprint: string,
    allowRegex: boolean,
    allowSignals: boolean,
  ): string {
    return `${fingerprint}:${allowRegex ? 'regex' : 'plain'}:${allowSignals ? 'signals' : 'basic'}`;
  }

  private actionCacheKey(fingerprint: string, allowTemplates: boolean): string {
    return `${fingerprint}:${allowTemplates ? 'templates' : 'basic'}`;
  }

  /**
   * Checks if any condition within a group uses a regex operator.
   */
  private containsRegexCondition(group: ConditionDefinition): boolean {
    return group.conditions.some(
      (condition) =>
        this.isStringCondition(condition) && condition.operator === 'regex',
    );
  }

  private containsSignalCondition(group: ConditionDefinition): boolean {
    return group.conditions.some((condition) => condition.type === 'signal');
  }

  /**
   * Type guard to check if a condition is a StringCondition.
   */
  private isStringCondition(
    condition: ConditionDefinition['conditions'][number],
  ): boolean {
    return condition.type === 'string';
  }
}
