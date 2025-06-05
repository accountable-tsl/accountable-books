import { CompanyType } from "../../src/domains/companies/companies.types";

export interface DemoSeedConfig {
  readonly companyType: CompanyType;
  readonly companyId: string;
  readonly userId: string;
  readonly shortCode?: string;
}
