/**
 * Build candidate explanation from rule result
 */

import type { RuleEngineResult } from '../rules/rules.engine.types.js';
import type { CategorizeLine } from '../rules/rules-def.types.js';

/**
 * Escape quotes in rule names to prevent double-quoting when wrapping in quotes
 * Only needed for rule names since we wrap them in quotes ourselves
 */
function escapeQuotes(str: string): string {
  return str.replace(/"/g, '\\"');
}

export function buildExplanationFromRuleResult(
  result: RuleEngineResult,
): string | null {
  if (!result.logs.length) {
    return null;
  }
  // Get all successfully applied rules
  const appliedRules = result.logs.filter(
    (log) =>
      log.status === 'success' && result.appliedRuleIds.includes(log.ruleId),
  );

  if (appliedRules.length === 0) {
    return null;
  }

  const parts: string[] = [];

  if (appliedRules.length === 1) {
    // Single rule case
    const rule = appliedRules[0];
    // Escape quotes in rule name to prevent doubling
    const ruleName = escapeQuotes(rule.ruleName || `Rule ${rule.ruleId}`);
    const conditions = rule.matchedConditions ?? [];
    const actions = rule.appliedActions ?? [];

    // Start with the rule name
    parts.push(`Rule "${ruleName}" applied`);

    // Add condition details if available
    if (conditions.length > 0) {
      const conditionDescriptions = conditions
        .filter((cond) => cond.success)
        .map((cond) => {
          // Build human-readable condition description
          const field = cond.field || 'field';
          const operator = cond.operator || 'matches';
          // Handle both null and undefined
          if (cond.kind === 'amount' && cond.actual != null) {
            return `${field} ${operator} ${cond.actual}`;
          }
          if (cond.kind === 'string' && cond.actual != null) {
            // Use raw value - we're building human-readable text, not JSON
            return `${field} ${operator} "${cond.actual}"`;
          }
          if (cond.kind === 'date' && cond.actual != null) {
            return `${field} ${operator} ${cond.actual}`;
          }
          return `${field} ${operator}`;
        })
        .filter((desc) => desc.length > 0); // Filter out empty descriptions

      if (conditionDescriptions.length > 0) {
        parts.push(`Matched: ${conditionDescriptions.join(', ')}`);
      }
    }

    // Add action details if available
    if (actions.length > 0) {
      const actionDescriptions = actions
        .map((action) => {
          if (action.type === 'categorize' && action.lineCount) {
            return `categorized into ${action.lineCount} journal line${action.lineCount > 1 ? 's' : ''}`;
          }
          if (action.type === 'set' && action.target && action.value) {
            return `set ${action.target} to ${action.value}`;
          }
          if (action.type === 'template' && action.template) {
            // Use raw template name - we're building human-readable text, not JSON
            return `applied template "${action.template}"`;
          }
          return action.type;
        })
        .filter((desc) => desc.length > 0);

      if (actionDescriptions.length > 0) {
        parts.push(`Actions: ${actionDescriptions.join(', ')}`);
      }
    }
  } else {
    // Multiple rules case
    const ruleNames = appliedRules.map((r) => {
      const name = r.ruleName || `Rule ${r.ruleId}`;
      return escapeQuotes(name); // Escape quotes
    });
    parts.push(
      `${appliedRules.length} rules applied: ${ruleNames
        .map((n) => `"${n}"`)
        .join(', ')}`,
    );

    // Summarize what each rule contributed
    const contributions: string[] = [];
    for (const rule of appliedRules) {
      const ruleName = escapeQuotes(rule.ruleName || `Rule ${rule.ruleId}`);
      const actions = rule.appliedActions ?? [];
      const actionDescriptions = actions
        .map((action) => {
          if (action.type === 'categorize' && action.lineCount) {
            return `categorized into ${action.lineCount} journal line${action.lineCount > 1 ? 's' : ''}`;
          }
          if (action.type === 'set' && action.target && action.value) {
            return `set ${action.target} to ${action.value}`;
          }
          if (action.type === 'template' && action.template) {
            const escapedTemplate = escapeQuotes(action.template);
            return `applied template "${escapedTemplate}"`;
          }
          return action.type;
        })
        .filter((desc) => desc.length > 0);

      if (actionDescriptions.length > 0) {
        contributions.push(`${ruleName} ${actionDescriptions.join(', ')}`);
      }
    }

    if (contributions.length > 0) {
      parts.push(`Contributions: ${contributions.join('; ')}`);
    }
  }

  // Join with proper spacing - ensure no double periods and consistent spacing
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('. ')
    .replace(/\.\s*\./g, '.') // Remove double periods
    .trim();
}

/**
 * Round amount to 2 decimal places (currency precision)
 */
function toCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Get split value from categorize line
 * @deprecated Currently unused, kept for future split functionality
 */

function getSplitValue(line: CategorizeLine): number | null {
  if ('value' in line && typeof line.value === 'number') {
    return line.value;
  }
  return null;
}

/**
 * Compute amounts for categorize lines
 */
type CategorizeLineWithAmount = CategorizeLine & { amount: number };
export function computeCategorizeAmounts(
  lines: CategorizeLine[],
  signedTotalAmount: number,
): Array<CategorizeLineWithAmount> {
  if (signedTotalAmount === 0) return [];

  const total = signedTotalAmount;
  const totalAbs = Math.abs(signedTotalAmount);

  // More than 1 remainder line is invalid
  const remainderLines = lines.filter(
    (line) => line.split_type === 'remainder',
  );
  if (remainderLines.length > 1) {
    throw new Error('Multiple remainder lines are not allowed');
  }

  const result: Array<CategorizeLineWithAmount> = [];
  const remainderLine = remainderLines[0] ?? undefined;

  let hasAmount = false;
  let hasPercent = false;
  let percentSum = 0;

  // Compute all non-remainder lines
  for (const line of lines) {
    if (line.split_type === 'remainder') {
      continue;
    }

    if (line.split_type === 'amount') {
      hasAmount = true;
    }

    if (line.split_type === 'percentage') {
      hasPercent = true;
      percentSum += line.value;
    }

    const raw =
      line.split_type === 'amount' ? line.value : totalAbs * line.value;

    result.push({ ...line, amount: toCurrency(raw) });
  }

  const currentSum = result.reduce((s, x) => s + x.amount, 0);

  // Validation rules
  const isMixed = hasAmount && hasPercent;
  const isOnlyPercent = hasPercent && !hasAmount;
  const percentNot100 = Math.abs(percentSum - 1) >= 0.0001;

  // Has amount + percentage splits but no remainder line
  if (isMixed && !remainderLine) {
    throw new Error(
      'Mixed amount + percentage splits require a remainder line',
    );
  }

  // Has only percentage splits not summing to 100% and no remainder line
  if (isOnlyPercent && percentNot100 && !remainderLine) {
    throw new Error(
      'Percentages must sum to 100% unless a remainder line exists',
    );
  }

  // Reconciliation
  const diff = total - currentSum;

  if (remainderLine) {
    // Remainder absorbs everything (including sign)
    const remainderAmt = toCurrency(diff);
    if (remainderAmt !== 0) {
      result.push({ ...remainderLine, amount: remainderAmt });
    }
  } else if (Math.abs(diff) < 0.01) {
    // Tiny rounding error → silently fix last line
    if (result.length > 0) {
      result[result.length - 1].amount = toCurrency(
        result[result.length - 1].amount + diff,
      );
    }
  } else if (diff !== 0) {
    // Big difference and no remainder - real error
    throw new Error(
      `Categorize lines do not sum to transaction total. ` +
        `Expected ${total}, got ${currentSum} (difference: ${diff})`,
    );
  }

  return result.filter((x) => x.amount !== 0);
}

export const allEqual = (...values: string[]): boolean => {
  return values.every((v) => v === values[0]);
};
