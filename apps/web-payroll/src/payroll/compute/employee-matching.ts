import type { PayrollRunItem } from '../domain';

/**
 * Get employee identifier for matching
 *
 * Extracts the identifiers we use for matching employees across runs.
 * We only use employeeRefId and taxId - no name matching.
 *
 * @param runItem - The payroll run item to extract identifiers from
 * @returns Object with refId and taxId (both may be undefined)
 */
export function getEmployeeIdentifier(runItem: PayrollRunItem): {
  refId: string | undefined;
  taxId: string | undefined;
} {
  return {
    refId: runItem.employeeRefId,
    taxId: runItem.employeeSnapshot.taxId,
  };
}

/**
 * Match an employee across different payroll runs
 *
 * STRICT MATCHING RULES (no fallbacks):
 * 1. If both have employeeRefId: Match if refIds are equal
 * 2. If target has no refId but has taxId: Match if taxIds are equal
 * 3. Otherwise: NO MATCH (return false)
 *
 * We do NOT match by name to prevent mis-attribution of income.
 * If an employee has no refId or taxId, they cannot be matched across runs.
 *
 * @param targetRefId - Employee reference ID from the target employee
 * @param targetTaxId - Tax ID from the target employee
 * @param candidateItem - The run item to check for a match
 * @returns true if the candidate matches the target, false otherwise
 */
export function matchEmployee(
  targetRefId: string | undefined,
  targetTaxId: string | undefined,
  candidateItem: PayrollRunItem,
): boolean {
  const candidate = getEmployeeIdentifier(candidateItem);

  // Rule 1: If both have employeeRefId, match by refId
  if (targetRefId && candidate.refId) {
    return targetRefId === candidate.refId;
  }

  // Rule 2: If target has no refId but has taxId, match by taxId
  // (Only if candidate also has taxId)
  if (!targetRefId && targetTaxId && candidate.taxId) {
    return targetTaxId === candidate.taxId;
  }

  // Rule 3: No match possible
  // - Target has refId but candidate doesn't: Different employees
  // - Target has no refId and no taxId: Cannot match
  // - Target has taxId but candidate doesn't: Cannot match
  return false;
}

/**
 * Check if two run items represent the same employee
 *
 * Convenience function that extracts identifiers from both items and matches them.
 *
 * @param item1 - First payroll run item
 * @param item2 - Second payroll run item
 * @returns true if both items represent the same employee, false otherwise
 */
export function areSameEmployee(
  item1: PayrollRunItem,
  item2: PayrollRunItem,
): boolean {
  const id1 = getEmployeeIdentifier(item1);
  return matchEmployee(id1.refId, id1.taxId, item2);
}
