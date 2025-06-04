import { CompanyType } from "../../src/domains/companies/companies.types";
import { demoSeedConfig } from "../data/config";
import { DemoSeedConfig } from "../data/types";
import { createSeedCompanyAndUser } from "../utils/createDemoCompany";
import { seedBankAccounts } from "../utils/seedBankAccounts";

/** Seed one demo scenario. */
export async function seedDemo(config: DemoSeedConfig): Promise<void> {
  console.log(`Seeding ${config.companyType} demo`);

  await createSeedCompanyAndUser(config);
  await seedBankAccounts({ companyType: config.companyType });
}

/** Seed all demos (serially by default, or in parallel with the flag). */
export async function seedAllDemos({
  parallel = false,
}: { parallel?: boolean } = {}): Promise<void> {
  if (parallel) {
    await Promise.all(demoSeedConfig.map(seedDemo));
  } else {
    for (const cfg of demoSeedConfig) await seedDemo(cfg);
  }
}

/** Seed by company type */
export async function seedByType(type: CompanyType): Promise<void> {
  const cfg = demoSeedConfig.find((s) => s.companyType === type);

  if (!cfg) throw new Error(`Unknown company type: ${type}`);

  await seedDemo(cfg);
}
