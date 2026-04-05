import { FIRM_ROLE_KEYS } from '@accountable-books/contracts/schema';

import type { AuthCompanyContext, RoleKey } from './types';

const FIRM_BOOKKEEPING_ROLE_KEYS = new Set<RoleKey>([...FIRM_ROLE_KEYS]);

export function isFirmBookkeepingRole(
  company: Pick<AuthCompanyContext, 'roleScope' | 'roleKey'> | null | undefined,
): boolean {
  if (!company?.roleKey || company.roleScope !== 'firm') return false;
  return FIRM_BOOKKEEPING_ROLE_KEYS.has(company.roleKey);
}

/**
 * Returns true for firm and platform roles — i.e. anyone who is NOT a client
 * user. Use this to gate accounting-only capabilities such as ledger explorer
 * access and note editing.
 */
export function isAccountingRole(
  company: Pick<AuthCompanyContext, 'roleKey'> | null | undefined,
): boolean {
  if (!company?.roleKey) return false;
  return !company.roleKey.startsWith('client_');
}
