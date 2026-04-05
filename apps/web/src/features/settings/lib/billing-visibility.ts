import type { AuthCompanyContext } from '@/modules/auth';
import type { CompanyData, CompanyType } from '@/modules/company/companies';

export type WorkspaceBillingView =
  | 'hidden'
  | 'firm'
  | 'client-self-serve'
  | 'client-managed';

type BillingVisibilityParams = {
  companyType?: CompanyType;
  currentCompany?: Pick<AuthCompanyContext, 'roleKey' | 'roleScope'> | null;
  company?: Pick<CompanyData, 'assignedFirmIsPlatform'> | null;
  isPlatformUser?: boolean;
};

export function getWorkspaceBillingView({
  companyType,
  currentCompany,
  company,
  isPlatformUser = false,
}: BillingVisibilityParams): WorkspaceBillingView {
  if (!companyType) return 'hidden';

  if (isPlatformUser) {
    return companyType === 'accounting_firm' ? 'firm' : 'client-self-serve';
  }

  if (companyType === 'accounting_firm') {
    return currentCompany?.roleScope === 'firm' &&
      currentCompany.roleKey === 'admin'
      ? 'firm'
      : 'hidden';
  }

  if (currentCompany?.roleScope !== 'company') return 'hidden';

  if (
    currentCompany.roleKey === 'client_owner' ||
    currentCompany.roleKey === 'client_admin'
  ) {
    return company?.assignedFirmIsPlatform === false
      ? 'client-managed'
      : 'client-self-serve';
  }

  return 'hidden';
}

export function canViewWorkspaceBilling(
  params: BillingVisibilityParams,
): boolean {
  return getWorkspaceBillingView(params) !== 'hidden';
}
