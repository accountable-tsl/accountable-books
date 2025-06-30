import { knexClient } from "../../knexClient";
import { CompanyType } from "../../src/domains/companies/companies.types";
import { registerNewAccount } from "../../src/features/signup/signup.service";
import { demoSeedConfig } from "./data/config";
import { DemoSeedConfig } from "./data/types";

/** Seed one demo scenario. */
export async function seedDemo(config: DemoSeedConfig): Promise<void> {
  console.log(`Seeding ${config.company?.type} demo`);

  await knexClient.transaction(async (trx) => {
    // Check if company already exists
    const existingCompany = await trx("companies")
      .where("short_code", config.company.shortCode)
      .first();

    // Check if user already exists
    const existingUser = await trx("users")
      .where("email", config.user.email)
      .first();

    if (existingCompany || existingUser) {
      console.log(
        `Demo "${config.company.legalName}" already seeded. Skipping.`
      );
      return;
    }

    // Create company and user
    const signup = await registerNewAccount(trx, {
      user: config.user,
      company: config.company,
    });
    if (!signup.success || !signup.data) throw new Error(signup.message);
    const { user, company } = signup.data;
  });

  // Add bank account(s)
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
  const cfg = demoSeedConfig.find((s) => s.company?.type === type);

  if (!cfg) throw new Error(`Unknown company type: ${type}`);

  await seedDemo(cfg);
}
