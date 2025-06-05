import { companyType } from "../../src/domains/companies/companies.types";
import { DemoSeedConfig } from "./types";

export const demoSeedConfig: readonly DemoSeedConfig[] = [
  {
    companyType: companyType.enum.individual,
    companyId: "22a610ae-3c90-4f38-8c07-767fed1da300",
    userId: "2baf27e9-fd28-40ad-9847-1b0f4234a5ac",
    shortCode: "indDemo",
  },
  {
    companyType: companyType.enum.business,
    companyId: "3749bf14-8e39-47ef-b88f-211eed710c57",
    userId: "3f21599b-28c7-486d-94bb-1a81d84e5dc5",
    shortCode: "bizDemo",
  },
  {
    companyType: companyType.enum.accounting_firm,
    companyId: "740565ee-4496-4c3b-99ca-d25a7dd3312c",
    userId: "78633877-241f-4f5e-be7e-6e08e5db010e",
    shortCode: "firmDemo",
  },
] as const;
