import { createSeedCompanyAndUser } from "../utils/createDemoCompany";

export async function seedDemoIndividual() {
  console.log("Running demo individual seed");
  await createSeedCompanyAndUser({
    companyType: "individual",
    companyId: "22a610ae-3c90-4f38-8c07-767fed1da300",
    userId: "2baf27e9-fd28-40ad-9847-1b0f4234a5ac",
  });
}
