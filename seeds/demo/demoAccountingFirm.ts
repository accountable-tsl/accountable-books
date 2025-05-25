import { createSeedCompanyAndUser } from "../utils/createDemoCompany";

export async function seedDemoAccountingFirm() {
  console.log("Running demo accounting firm seed");
  // Remember to add await to the functions
  await createSeedCompanyAndUser("accounting_firm");
}
