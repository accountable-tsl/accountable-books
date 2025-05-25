import { createSeedCompanyAndUser } from "../utils/createDemoCompany";

export async function seedDemoBusiness() {
  console.log("Running demo business seed");
  // Remember to add await to the functions
  await createSeedCompanyAndUser("business");
}
