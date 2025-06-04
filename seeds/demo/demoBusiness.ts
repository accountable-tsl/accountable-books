import { createSeedCompanyAndUser } from "../utils/createDemoCompany";

export async function seedDemoBusiness() {
  console.log("Running demo business seed");
  // Remember to add await to the functions
  await createSeedCompanyAndUser({
    companyType: "business",
    companyId: "3749bf14-8e39-47ef-b88f-211eed710c57",
    userId: "3f21599b-28c7-486d-94bb-1a81d84e5dc5",
  });
}
