import { billing } from '@accountable-books/contracts/schema';

const COMPANY_TYPE_TO_OWNER_TYPE: Record<
  string,
  billing.BillingAccountOwnerType
> = {
  accounting_firm: 'firm',
  business: 'business',
  individual: 'individual',
};

export function deriveBillingAccountOwnerType(
  companyType: string,
): billing.BillingAccountOwnerType {
  const ownerType = COMPANY_TYPE_TO_OWNER_TYPE[companyType];
  if (!ownerType) {
    throw new Error(`Unsupported company type for billing: ${companyType}`);
  }
  return ownerType;
}
