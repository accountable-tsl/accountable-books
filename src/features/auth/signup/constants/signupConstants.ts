import { companyType, CompanyType } from "@/types/types";
import { NewCompany, NewUser } from "../signupTypes";

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

export const COMPANY_SIZE = [
  { value: "1-10", label: "1-10 employees" },
  { value: "11-50", label: "11-50 employees" },
  { value: "51-500", label: "51-500 employees" },
  { value: "501-2000", label: "501-2000 employees" },
  { value: "2000+", label: "2000+ employees" },
];

export const TOOLTIP: Record<string, string> = {
  companyType:
    " What kind of company do you want to create? You will not be able to change this selection after signup",
  reportingCurrency:
    " In what currency do you need to track your financials in? Not sure, check with your regulator or call us",
  country: "Select the country your business operates in",
  industry: "What industry do you operate in. Choose the closest or other",
  description: "This helps our system categorize your transactions even better",
  yearEnd: "The month and day your business year officially ends",

  registrationNumber:
    "Company Registration Number or Companies House Number - Official company number issued when you registered your business",
  taxId:
    "Your business’s tax identification number, VAT ID or EIN - often used for invoicing and compliance",
  website: "Your official company website (if available)",
};
