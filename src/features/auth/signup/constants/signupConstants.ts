import { companyType, CompanyType } from "@/types/types";

export const COMPANY_TYPES: {
  key: CompanyType;
  type: string;
  description: string;
  idealFor: string;
  icon: string;
}[] = [
  {
    key: "business",
    type: "Business",
    description: "I run a business and want to manage its finances",
    idealFor: "Founders, Business Owners",
    icon: "🏢",
  },
  {
    key: "accounting_firm",
    type: "Accounting Firm",
    description: "I provide accounting services to clients",
    idealFor: "Accounting firms, freelance bookkeepers",
    icon: "🧑‍💻",
  },
  {
    key: "individual",
    type: "Individual",
    description: "I want to track my personal expenses",
    idealFor: "Individuals, Students, Personal Finance Enthusiasts",
    icon: "👤",
  },
];

export const TOOLTIP = {
  companyType:
    " What kind of company do you want to create? You will not be able to change this selection after signup.",
};
