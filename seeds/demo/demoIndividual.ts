import { createSeedCompanyAndUser } from "../utils/createDemoCompany";

export async function seedDemoIndividual() {
  console.log("Running demo individual seed");
  await createSeedCompanyAndUser("individual");
}
