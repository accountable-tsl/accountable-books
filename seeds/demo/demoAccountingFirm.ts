import { createSeedCompanyAndUser } from "../utils/createDemoCompany";
import { seedBankAccounts } from "../utils/seedBankAccounts";

const companyType = "accounting_firm";
export async function seedDemoAccountingFirm() {
  console.log("Running demo accounting firm seed");
  // Remember to add await to the functions
  await createSeedCompanyAndUser({
    companyType,
    companyId: "740565ee-4496-4c3b-99ca-d25a7dd3312c",
    userId: "78633877-241f-4f5e-be7e-6e08e5db010e",
  });

  await seedBankAccounts({ companyType });
}
