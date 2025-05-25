import { CompanyType } from "./types";

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

export const ACCOUNTING_BASIS = [
  { value: "modified_cash_basis", label: "Modified Cash Basis" },
  { value: "modified_accrual_basis", label: "Modified Accrual Basis" },
];
