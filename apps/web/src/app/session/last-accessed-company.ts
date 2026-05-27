const LAST_COMPANY_ID_KEY = 'last-accessed-company-id';

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

export function getLastAccessedCompanyId(): string | null {
  if (!canUseLocalStorage()) return null;
  return localStorage.getItem(LAST_COMPANY_ID_KEY);
}

export function setLastAccessedCompanyId(companyId: string): void {
  if (!canUseLocalStorage() || !companyId) return;
  localStorage.setItem(LAST_COMPANY_ID_KEY, companyId);
}

export function clearLastAccessedCompanyId(): void {
  if (!canUseLocalStorage()) return;
  localStorage.removeItem(LAST_COMPANY_ID_KEY);
}
