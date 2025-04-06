import type { Knex } from "knex";
import { NewAccountTypeInput } from "../types/db";
import { accountElementIds } from "./constants/ids";

type AccountTypeWithId = NewAccountTypeInput & { id: string };

const defaultNonCurrentAssetTypes: AccountTypeWithId[] = [
  {
    id: "9d8e5ec9-e9b7-43d6-8dde-b80a552fb64e",
    key: "nca_ppe", //nca - non current asset
    label: "Property, Plant, Equipment",
    account_element_id: accountElementIds.nonCurrentAsset,
    description:
      "Tangible long-term assets used in business operations, including buildings, machinery, and vehicles",
  },
  {
    id: "276ef71c-10b1-44d2-a6ce-23752b047949",
    key: "nca_contra_depreciation_ppe",
    label: "Accumulated Depreciation - PPE",
    account_element_id: accountElementIds.contraAsset,
    description:
      "Cumulative depreciation of Property, Plant, and Equipment over their useful life",
  },
  {
    id: "620cb7cb-6283-48d7-840b-81f4b23419f4",
    key: "nca_right_of_use_asset",
    label: "Right-of-Use Assets", // Maybe I should remove this and let users handle it themselves. just have fixed assets, maybe
    account_element_id: accountElementIds.nonCurrentAsset,
    description:
      "Right-of-use assets from long-term lease agreements under IFRS 16 or ASC 842",
  },
  {
    id: "4d6d0cb4-66de-4285-9eb4-eec81de03cfc",
    key: "nca_contra_depreciation_right_of_use_asset",
    label: "Accumulated Depreciation and Amortization - Right-of-Use Assets",
    account_element_id: accountElementIds.contraAsset,
    description: "Cumulative depreciation or amortization of leased assets",
  },
  {
    id: "50a5d1ca-5219-4d43-903e-8d926067a0f1",
    key: "nca_intangible_asset",
    label: "Intangible Assets",
    account_element_id: accountElementIds.nonCurrentAsset,
    description:
      "Non-physical long-term assets such as patents, trademarks, and goodwill",
  },
  {
    id: "7aac324c-1205-477e-a084-112de81c4152",
    key: "nca_contra_amortization_intangible_asset",
    label: "Accumulated Amortization - Intangible Assets",
    account_element_id: accountElementIds.contraAsset,
    description:
      "Cumulative amortization of intangible assets over their useful life",
  },
  {
    id: "0bbb12c0-ebe3-4ad6-879f-c277ed862ad2",
    key: "nca_other",
    label: "Other Noncurrent Assets",
    account_element_id: accountElementIds.nonCurrentAsset,
    description:
      "Long-term assets not classified elsewhere, including deferred tax assets and long-term investments",
  },
];
const defaultCurrentAssetTypes: AccountTypeWithId[] = [
  {
    id: "d9c4adcd-add7-4602-a1bc-1edad19da4f0",
    key: "ca_bank",
    label: "Bank",
    account_element_id: accountElementIds.currentAsset,
    description: "Ledger for cash held in company bank accounts, petty cash",
  },
  {
    id: "4a5d0024-6234-4982-809c-f16e3be7f379",
    key: "ca_cash_equivalent",
    label: "Investments and Cash Equivalents",
    account_element_id: accountElementIds.currentAsset,
    description:
      "Short-term, highly liquid investments that are readily convertible to cash",
  },
  {
    id: "10149b24-6827-475d-a657-77497c0856a0",
    key: "ca_inventory",
    label: "Inventory",
    account_element_id: accountElementIds.currentAsset,
    description:
      "Goods held for sale, raw materials, work-in-progress, and finished goods",
  },
  {
    id: "d764021a-0847-4be8-a687-9c8195b47f6d",
    key: "ca_trade_receivable",
    label: "Trade Receivables",
    account_element_id: accountElementIds.currentAsset,
    description:
      "Amounts owed to the company by customers for goods or services provided on credit",
  },
  {
    id: "083d362e-2715-4556-922a-c86a6966bb98",
    key: "ca_contra",
    label: "Contra Current Assets",
    account_element_id: accountElementIds.contraAsset,
    description:
      "Contra accounts that reduce current asset balances, such as allowances for doubtful debts or obsolete inventory reserves",
  },
  {
    id: "6c1d4db4-2f10-4c82-9ffa-a4a18e80a3ef",
    key: "ca_contract_asset",
    label: "Contract Assets",
    account_element_id: accountElementIds.currentAsset,
    description:
      "Rights to payment for goods or services that have been delivered but not yet invoiced or billed to the customer",
  },
  {
    id: "176abf7d-d7d2-46fe-8981-5f3e1ddcf880",
    key: "ca_other_receivable",
    label: "Other Receivables",
    account_element_id: accountElementIds.currentAsset,
    description:
      "Any other amounts owed to the company outside of trade receivables, such as tax refunds, interest receivables, or employee advances",
  },
  {
    id: "a0328b6e-4257-435f-9533-53ed9ccc2bf2",
    key: "ca_prepayment",
    label: "Prepayments",
    account_element_id: accountElementIds.currentAsset,
    description:
      "Expenses paid in advance for future goods or services, such as insurance or rent",
  },
  {
    id: "140e3f60-337b-4bf2-b42d-3c7f37dea88f",
    key: "ca_other_current_asset",
    label: "Other Current Assets",
    account_element_id: accountElementIds.currentAsset,
    description:
      "Short-term assets not classified elsewhere, typically convertible to cash within one year",
  },
];
const defaultNonCurrentLiabilityTypes: AccountTypeWithId[] = [
  {
    id: "384e10f1-d5a1-429a-86c9-dfc6dc1760c6",
    key: "ncl_loans",
    label: "Long Term Loans",
    account_element_id: accountElementIds.nonCurrentLiabilities,
    description:
      "Borrowed funds due beyond one year, such as mortgages or long-term bank loans",
  },
  {
    id: "d01e3dfc-553b-4846-bd44-1078f94c43ee",
    key: "ncl_other",
    label: "Other Long-Term Liabilities",
    account_element_id: accountElementIds.nonCurrentLiabilities,
    description:
      "Non-current obligations not classified elsewhere, including deferred tax liabilities and long-term lease obligations",
  },
];
const defaultCurrentLiabilityTypes: AccountTypeWithId[] = [
  {
    id: "7def2082-8695-4d32-a385-2827e46747db",
    key: "cl_trade_payable",
    label: "Trade Payables", // Should I switch to trade payables too?
    account_element_id: accountElementIds.currentLiabilities,
    description:
      "Amounts owed by the company to suppliers for goods or services purchased on credit",
  },
  {
    id: "0db706af-b567-4ce2-b299-ac44c05eb60f",
    key: "cl_accruals_other",
    label: "Accruals and Other Payables",
    account_element_id: accountElementIds.currentLiabilities,
    description:
      "Expenses incurred but not yet paid, and other short-term obligations such as wages payable or taxes due",
  },
  {
    id: "f7e721d0-9912-402e-8746-7e9ef55f6cde",
    key: "cl_contract_liabilities",
    label: "Contract Liabilities (Deferred Revenue)",
    account_element_id: accountElementIds.currentLiabilities,
    description:
      "Payments or Deposits received in advance for goods, services or projects that have not yet been delivered. Represents obligations to provide products or services in the future",
  },
  {
    id: "7780f7f0-ad31-44b7-acd1-d39a0a6c01a1",
    key: "cl_short_term_loans",
    label: "Short Term Loans",
    account_element_id: accountElementIds.currentLiabilities,
    description:
      "Borrowed funds due for repayment within one year, including bank overdrafts and short-term credit lines",
  },
  {
    id: "54506f3f-d065-4068-9b1c-ea81d231543f",
    key: "cl_tax",
    label: "Tax Payable",
    account_element_id: accountElementIds.currentLiabilities,
    description: "Short-term tax obligations, typically due within one year",
  },
  {
    id: "7a9cea0c-223f-4854-8344-1ceee1436ed3",
    key: "cl_other",
    label: "Other Current Liabilities",
    account_element_id: accountElementIds.currentLiabilities,
    description:
      "Short-term obligations not classified elsewhere, typically due within one year, such as unearned revenue or current portions of long-term debt",
  },
];
const defaultEquityTypes: AccountTypeWithId[] = [
  {
    id: "39a0bb4a-fae3-4eab-bdac-fcf2794476a5",
    key: "eq_contributed_capital",
    label: "Contributed Capital",
    account_element_id: accountElementIds.capital,
    description:
      "Share capital, premium, APIC, other direct contributions from owners",
  },
  {
    id: "8f84a613-1b9b-412b-a29e-168e542b7467",
    key: "eq_retained_earnings",
    label: "Retained Earnings",
    account_element_id: accountElementIds.reserves,
    description:
      "Accumulated net income retained in the business after dividends are paid",
  },
  {
    id: "f1ee9996-005d-4b7d-804d-9c61437f9f82",
    key: "eq_oci",
    label: "Accumulated Other Comprehensive Income (AOCI)",
    account_element_id: accountElementIds.otherEquity,
    description: "Accumulated Other Comprehensive Income",
  },
  {
    id: "230cef7a-ed92-4eef-b76b-2b7cbfa43d6c",
    key: "eq_other",
    label: "Other Components of Equity",
    account_element_id: accountElementIds.otherEquity,
    description:
      "All other components of equity not included in any other category",
  },
];
const defaultIncomeTypes: AccountTypeWithId[] = [
  {
    id: "16527f50-d94a-4fb5-bdfb-86ad51ebaa7e",
    key: "rev_service",
    label: "Service Income",
    account_element_id: accountElementIds.revenue,
    description: "Revenue earned for services rendered",
  },
  {
    id: "bbf219fb-2dbf-48fa-b44b-ef2106c43982",
    key: "rev_product",
    label: "Product Sales",
    account_element_id: accountElementIds.revenue,
    description: "Revenue from sale of goods",
  },
  {
    id: "89028f2e-2935-4d6f-add6-bed5354d2f50",
    key: "rev_contra",
    label: "Revenue Deductions (Contra-Revenue)",
    account_element_id: accountElementIds.contraRevenue,
    description: "Reductions to revenue due to returns, discounts, or credits",
  },
  {
    id: "3901ec6d-91b5-449b-8805-e71526dd8450",
    key: "rev_finance_income",
    label: "Finance Income",
    account_element_id: accountElementIds.otherIncome,
    description: "Interest earned, dividends, gains on financial instruments",
  },
  {
    id: "6760059c-be41-4d66-bb1d-d1cb5994588b",
    key: "rev_other_income",
    label: "Other Income",
    account_element_id: accountElementIds.otherIncome,
    description:
      "Miscellaneous income such as asset sales, grants, or one-time gains",
  },
];
const defaultExpenseTypes: AccountTypeWithId[] = [
  {
    id: "605362fc-58e5-436d-805e-008d6313f4bb",
    key: "exp_cos",
    label: "Cost of sales",
    account_element_id: accountElementIds.costOfSales,
    description:
      "Direct costs incurred in the production or acquisition of goods sold",
  },
  {
    id: "a1a658a0-7b31-4f2b-b5d0-978da055763c",
    key: "exp_opex_employee_benefits",
    label: "Employee Benefits",
    account_element_id: accountElementIds.opex,
    description:
      "Wages, salaries, and benefits paid to employees, including bonuses, pensions, health insurance",
  },
  {
    id: "23b862cb-00cd-463b-8efb-b1e68ee3c3fa",
    key: "exp_opex_marketing",
    label: "Marketing and Advertising",
    account_element_id: accountElementIds.opex,
    description:
      "Costs associated with promoting the company's products or services",
  },
  {
    id: "9458fa43-3c15-4e63-918d-8c54ad1b3fcd",
    key: "exp_opex_rent",
    label: "Rent",
    account_element_id: accountElementIds.opex,
    description:
      "Payments for the use of real estate or property, including office, retail, or warehouse spaces",
  },
  {
    id: "5e00bbdf-a6a0-4c4a-b0d8-9d7117138b8e",
    key: "exp_opex_insurance",
    label: "Insurance",
    account_element_id: accountElementIds.opex,
    description:
      "Premiums paid for business insurance coverage, including liability, property, health, and workers' compensation",
  },
  {
    id: "161369ce-aebb-48b6-b350-0f097d252895",
    key: "exp_opex_utilities",
    label: "Utilities",
    account_element_id: accountElementIds.opex,
    description:
      "Recurring costs for electricity, water, gas, and waste disposal essential to business operations",
  },
  {
    id: "7b683e39-579b-475f-bed6-0313735b8082",
    key: "exp_opex_repairs",
    label: "Repairs and Maintenance",
    account_element_id: accountElementIds.opex,
    description: "Costs for maintaining and repairing company-owned assets",
  },
  {
    id: "27d0095c-b6d9-436e-889e-28a336a60227",
    key: "exp_opex_professional_fees",
    label: "Professional Fees",
    account_element_id: accountElementIds.opex,
    description:
      "Fees paid to external professionals, such as lawyers and consultants",
  },
  {
    id: "9a03e2e3-9b78-4cc7-ba42-54125ea61d3b",
    key: "exp_opex_tel_internet",
    label: "Telephone and Internet Expenses",
    account_element_id: accountElementIds.opex,
    description:
      "Expenses for landline, mobile, and internet services used in business communication and operations",
  },
  {
    id: "57b361b5-4a6e-4f28-ad1f-be9bf615066b",
    key: "exp_opex_software_subscriptions",
    label: "IT Software, Subscriptions and Consumables",
    account_element_id: accountElementIds.opex,
    description:
      "Costs of cloud software, SaaS tools, licensing fees and general IT consumables",
  },
  {
    id: "9261acd9-ab25-4804-bc89-7581223b1fb8",
    key: "exp_opex_travel",
    label: "Transport and Travel",
    account_element_id: accountElementIds.opex,
    description:
      "Expenses related to employee transportation and business travel",
  },
  {
    id: "79170de2-df5f-4ef3-ab13-9260e0d5fe0d",
    key: "exp_opex_depreciation_amortization",
    label: "Depreciation and Amortization",
    account_element_id: accountElementIds.opex,
    description:
      "The allocation of the cost of tangible and intangible assets over their useful life",
  },
  {
    id: "1c06789d-ccd5-407e-af5f-abbec6c5745a",
    key: "exp_opex_memberships",
    label: "Memberships, Subscriptions & Dues",
    account_element_id: accountElementIds.opex,
    description:
      "Membership fees, regulatory licenses, and subscriptions to trade bodies or industry organizations",
  },
  {
    id: "dfd8c5bb-3b03-4466-88c7-c4075c419d86",
    key: "exp_opex_other",
    label: "Other Administrative Expenses",
    account_element_id: accountElementIds.opex,
    description:
      "Miscellaneous expenses related to the general running of the business",
  },
  {
    id: "3a2a0a25-cd2c-4b9b-baf2-b3a46d78c2be",
    key: "exp_nopex_finance_costs",
    label: "Finance Costs",
    account_element_id: accountElementIds.nonOpex,
    description:
      "Costs incurred from borrowing funds, including interest and other charges",
  },
  {
    id: "cfcd5b51-348b-4b92-8045-dc6485bca69e",
    key: "exp_nopex_other",
    label: "Other Non-Operating Expenses",
    account_element_id: accountElementIds.nonOpex,
    description: "Expenses not related to core business operations",
  },
  {
    id: "26d7dc5c-e1f7-4159-8786-dac74a0f20d1",
    key: "exp_nopex_tax",
    label: "Tax Expense",
    account_element_id: accountElementIds.nonOpex,
    description: "Income taxes payable by the company on its earnings",
  },
];

const defaultAccountTypes: AccountTypeWithId[] = [
  ...defaultNonCurrentAssetTypes,
  ...defaultCurrentAssetTypes,
  ...defaultNonCurrentLiabilityTypes,
  ...defaultCurrentLiabilityTypes,
  ...defaultEquityTypes,
  ...defaultIncomeTypes,
  ...defaultExpenseTypes,
];

export async function seed(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx("account_type").insert(defaultAccountTypes).onConflict().ignore();

    if (process.env.NODE_ENV !== "production") {
      console.log(`Seeded ${defaultAccountTypes.length} account types`);
    }
  });
}
