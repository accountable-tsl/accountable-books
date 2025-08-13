import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
  preventUpdateOrDelete,
} from './utils/timestamp';
import { AccountTypeWithRequiredReportCode } from '../src/core/types/db.types';
import { accountElementIds } from './data/ids';
import { NODE_ENV } from '../src/config/env';

const defaultNonCurrentAssetTypes: AccountTypeWithRequiredReportCode[] = [
  {
    id: '645e5c04-7638-49ed-aabd-6bce8b089a17',
    key: 'nca_land', //nca - non current asset
    label: 'Land',
    account_element_id: accountElementIds.nonCurrentAsset,
    description: 'Land owned by the business, not subject to depreciation',
    report_code: 'BS.ASS.NCA.LND',
  },
  {
    id: '9d8e5ec9-e9b7-43d6-8dde-b80a552fb64e',
    key: 'nca_ppe', //nca - non current asset
    label: 'Property, Plant, Equipment',
    account_element_id: accountElementIds.nonCurrentAsset,
    description:
      'Tangible long-term assets used in business operations, including buildings, machinery, and vehicles',
    report_code: 'BS.ASS.NCA.PPE',
  },
  {
    id: '276ef71c-10b1-44d2-a6ce-23752b047949',
    key: 'nca_ppe_contra',
    label: 'Contra Property, Plant, Equipment',
    account_element_id: accountElementIds.contraAsset,
    description: 'Cumulative depreciation of Property, Plant, and Equipment over their useful life',
    report_code: 'BS.ASS.NCA.PPE.CTR',
  },
  {
    id: 'f3e9e2a4-6b0a-4d1d-8c9e-3f6f6c1b3c4d',
    key: 'nca_investment_property', //nca - non current asset
    label: 'Investment Property',
    account_element_id: accountElementIds.nonCurrentAsset,
    description:
      'Property (land or a building or part of a building or both) held to earn rentals or for capital appreciation or both',
    report_code: 'BS.ASS.NCA.IVP',
  },
  {
    id: '20be47b9-6069-4143-ae72-266f6e0f2f84',
    key: 'nca_investment_property_contra',
    label: 'Contra Investment Property',
    account_element_id: accountElementIds.contraAsset,
    description: 'Cumulative depreciation of Property, Plant, and Equipment over their useful life',
    report_code: 'BS.ASS.NCA.PPE.CTR',
  },
  {
    id: '620cb7cb-6283-48d7-840b-81f4b23419f4',
    key: 'nca_rou_asset',
    label: 'Right-of-Use Assets',
    account_element_id: accountElementIds.nonCurrentAsset,
    description: 'Right-of-use assets from long-term lease agreements under IFRS 16 or ASC 842',
    report_code: 'BS.ASS.NCA.ROU',
  },
  {
    id: '4d6d0cb4-66de-4285-9eb4-eec81de03cfc',
    key: 'nca_rou_asset_contra',
    label: 'Contra Right-of-Use Assets',
    account_element_id: accountElementIds.contraAsset,
    description: 'Cumulative depreciation or amortization of leased assets',
    report_code: 'BS.ASS.NCA.ROU.CTR',
  },
  {
    id: '50a5d1ca-5219-4d43-903e-8d926067a0f1',
    key: 'nca_intangible_asset',
    label: 'Intangible Assets',
    account_element_id: accountElementIds.nonCurrentAsset,
    description: 'Non-physical long-term assets such as patents, trademarks, and goodwill',
    report_code: 'BS.ASS.NCA.INT',
  },
  {
    id: '7aac324c-1205-477e-a084-112de81c4152',
    key: 'nca_intangible_asset_contra',
    label: 'Contra Intangible Assets',
    account_element_id: accountElementIds.contraAsset,
    description: 'Cumulative amortization of intangible assets over their useful life',
    report_code: 'BS.ASS.NCA.INT.CTR',
  },
  {
    id: '0bbb12c0-ebe3-4ad6-879f-c277ed862ad2',
    key: 'nca_other',
    label: 'Other Non-current Assets',
    account_element_id: accountElementIds.nonCurrentAsset,
    description:
      'Long-term assets not classified elsewhere, including deferred tax assets and long-term investments',
    report_code: 'BS.ASS.NCA.OTH',
  },
];
const defaultCurrentAssetTypes: AccountTypeWithRequiredReportCode[] = [
  {
    id: 'd9c4adcd-add7-4602-a1bc-1edad19da4f0',
    key: 'ca_bank',
    label: 'Bank',
    account_element_id: accountElementIds.currentAsset,
    description: 'Ledger for cash held in company bank accounts, petty cash',
    report_code: 'BS.ASS.CUR.BNK',
  },
  {
    id: '4a5d0024-6234-4982-809c-f16e3be7f379',
    key: 'ca_cash_equivalent',
    label: 'Cash Equivalents',
    account_element_id: accountElementIds.currentAsset,
    description: 'Short-term, highly liquid investments that are readily convertible to cash',
    report_code: 'BS.ASS.CUR.CEQ',
  },
  {
    id: '10149b24-6827-475d-a657-77497c0856a0',
    key: 'ca_inventory',
    label: 'Inventory',
    account_element_id: accountElementIds.currentAsset,
    description: 'Goods held for sale, raw materials, work-in-progress, and finished goods',
    report_code: 'BS.ASS.CUR.INV',
  },
  {
    id: 'c26e7b85-92c1-4555-8b1a-d394376a64cb',
    key: 'ca_inventory_contra',
    label: 'Contra Inventory',
    account_element_id: accountElementIds.contraAsset,
    description:
      'Offset or reduce the value of inventory, often reflecting returns, allowances, or obsolescence e.g Inventory Obsolescence Reserves',
    report_code: 'BS.ASS.CUR.INV.CTR',
  },
  {
    id: 'd764021a-0847-4be8-a687-9c8195b47f6d',
    key: 'ca_trade_receivable',
    label: 'Trade Receivables',
    account_element_id: accountElementIds.currentAsset,
    description:
      'Amounts owed to the company by customers for goods or services provided on credit',
    report_code: 'BS.ASS.CUR.TRC',
  },
  {
    id: '083d362e-2715-4556-922a-c86a6966bb98',
    key: 'ca_trade_receivable_contra',
    label: 'Allowance for doubtful accounts',
    account_element_id: accountElementIds.contraAsset,
    description:
      'Reduces the value of accounts receivable to reflect the estimated amount that might not be collected e.g Allowance for doubtful accounts',
    report_code: 'BS.ASS.CUR.TRC.CTR',
  },
  {
    id: '6c1d4db4-2f10-4c82-9ffa-a4a18e80a3ef',
    key: 'ca_contract_asset',
    label: 'Contract Assets',
    account_element_id: accountElementIds.currentAsset,
    description:
      'Rights to payment for goods or services that have been delivered but not yet invoiced or billed to the customer',
    report_code: 'BS.ASS.CUR.CTA',
  },
  {
    id: 'a0328b6e-4257-435f-9533-53ed9ccc2bf2',
    key: 'ca_prepayment',
    label: 'Prepayments',
    account_element_id: accountElementIds.currentAsset,
    description: 'Expenses paid in advance for future goods or services, such as insurance or rent',
    report_code: 'BS.ASS.CUR.PRP',
  },
  {
    id: '1db337dc-9a0e-48d7-84c8-35e1ca098ef6',
    key: 'ca_due_from_related_party',
    label: 'Due from Related Parties',
    account_element_id: accountElementIds.currentAsset,
    description: 'Loans to directors, staff salary advances etc',
    report_code: 'BS.ASS.CUR.RPA',
  },
  {
    id: '176abf7d-d7d2-46fe-8981-5f3e1ddcf880',
    key: 'ca_other_receivable',
    label: 'Other Receivables',
    account_element_id: accountElementIds.currentAsset,
    description:
      'Any other amounts owed to the company outside of trade receivables, such as tax refunds, interest receivables, or employee advances',
    report_code: 'BS.ASS.CUR.OTR',
  },
  {
    id: '140e3f60-337b-4bf2-b42d-3c7f37dea88f',
    key: 'ca_other',
    label: 'Other Current Assets',
    account_element_id: accountElementIds.currentAsset,
    description:
      'Short-term assets not classified elsewhere, typically convertible to cash within one year',
    report_code: 'BS.ASS.CUR.OTH',
  },
];
const defaultNonCurrentLiabilityTypes: AccountTypeWithRequiredReportCode[] = [
  {
    id: '384e10f1-d5a1-429a-86c9-dfc6dc1760c6',
    key: 'ncl_long_term_debt',
    label: 'Long-Term Debt',
    account_element_id: accountElementIds.nonCurrentLiabilities,
    description: 'Borrowed funds due beyond one year, such as mortgages or long-term bank loans',
    report_code: 'BS.LIA.NCL.DBT',
  },
  {
    id: '5d8a18a7-477a-402c-8aca-f067cfe65520',
    key: 'ncl_long_term_debt_contra',
    label: 'Debt Discounts',
    account_element_id: accountElementIds.contraLiabilities,
    description: 'Contra-liability reducing the carrying value of long-term debt',
    report_code: 'BS.LIA.NCL.DBT.CTR',
  },
  {
    id: '127795fb-dba2-492e-8da4-0152854c7613',
    key: 'ncl_long_term_lease',
    label: 'Long-Term Lease Liabilities',
    account_element_id: accountElementIds.nonCurrentLiabilities,
    description: 'Long-term lease obligations under IFRS 16 / ASC 842',
    report_code: 'BS.LIA.NCL.LSE',
  },
  {
    id: 'd01e3dfc-553b-4846-bd44-1078f94c43ee',
    key: 'ncl_other',
    label: 'Other Non-current Liabilities',
    account_element_id: accountElementIds.nonCurrentLiabilities,
    description:
      'Other long-term liabilities not classified elsewhere such as deferred tax, warranties, pensions)',
    report_code: 'BS.LIA.NCL.OTH',
  },
];
const defaultCurrentLiabilityTypes: AccountTypeWithRequiredReportCode[] = [
  {
    id: '7def2082-8695-4d32-a385-2827e46747db',
    key: 'cl_trade_payable',
    label: 'Trade Payables',
    account_element_id: accountElementIds.currentLiabilities,
    description:
      'Amounts owed by the company to suppliers for goods or services purchased on credit',
    report_code: 'BS.LIA.CUR.TRP',
  },
  {
    id: 'be425527-419e-4f1c-9ab6-61eae841758d',
    key: 'cl_accrued_expenses',
    label: 'Accrued Expenses',
    account_element_id: accountElementIds.currentLiabilities,
    description:
      'Expenses incurred but not yet invoiced or paid, such as salaries payable, utilities, or interest owed',
    report_code: 'BS.LIA.CUR.ACC',
  },
  {
    id: '00ec4957-593e-47e9-b231-c7bab4c32a0d',
    key: 'cl_other_payables',
    label: 'Other Payables',
    account_element_id: accountElementIds.currentLiabilities,
    description:
      'Short-term obligations that do not fall under trade or accrued expenses, including statutory liabilities and sundry payables',
    report_code: 'BS.LIA.CUR.OPY',
  },
  {
    id: 'f7e721d0-9912-402e-8746-7e9ef55f6cde',
    key: 'cl_contract_liabilities',
    label: 'Contract Liabilities',
    account_element_id: accountElementIds.currentLiabilities,
    description:
      'Obligations arising from payments received in advance for goods or services to be delivered in the future, including customer deposits, project advances, and deferred revenue under contractual agreements (IFRS 15/ ASC 606)',
    report_code: 'BS.LIA.CUR.CTL',
  },
  {
    id: 'e4d6a7c6-0a5f-4f2c-8a4d-3f9e3d3f9e3d',
    key: 'cl_due_to_related_parties',
    label: 'Due to Related Parties',
    account_element_id: accountElementIds.currentLiabilities,
    description: 'Director loans, shareholder funding',
    report_code: 'BS.LIA.CUR.RPL',
  },
  {
    id: '7780f7f0-ad31-44b7-acd1-d39a0a6c01a1',
    key: 'cl_short_term_debt',
    label: 'Short-Term Debt',
    account_element_id: accountElementIds.currentLiabilities,
    description: 'Borrowings due within one year, such as bank overdrafts, short-term credit lines',
    report_code: 'BS.LIA.CUR.STD',
  },
  {
    id: 'de69a07e-18f4-49b9-9bc8-265cffd6ca14',
    key: 'cl_short_term_debt_contra',
    label: 'Debt Discounts - Short-Term Debt',
    account_element_id: accountElementIds.contraLiabilities,
    description: 'Contra-liability reducing the carrying value of short-term debt',
    report_code: 'BS.LIA.CUR.STD.CTR',
  },
  {
    id: '54506f3f-d065-4068-9b1c-ea81d231543f',
    key: 'cl_tax',
    label: 'Tax Payable',
    account_element_id: accountElementIds.currentLiabilities,
    description: 'Tax obligations due within one year',
    report_code: 'BS.LIA.CUR.TAX',
  },
  {
    id: '105e8efd-77e4-4572-8dc6-c56d404ce018',
    key: 'cl_current_debt_portion',
    label: 'Current Portion of Long-Term Debt',
    account_element_id: accountElementIds.currentLiabilities,
    description: 'Principal due within one year on long-term borrowings',
    report_code: 'BS.LIA.CUR.CPF',
  },
  {
    id: '7a9cea0c-223f-4854-8344-1ceee1436ed3',
    key: 'cl_other',
    label: 'Other Current Liabilities',
    account_element_id: accountElementIds.currentLiabilities,
    description: 'Short-term obligations not classified elsewhere',
    report_code: 'BS.LIA.CUR.OTH',
  },
];
const defaultEquityTypes: AccountTypeWithRequiredReportCode[] = [
  {
    id: '39a0bb4a-fae3-4eab-bdac-fcf2794476a5',
    key: 'eq_contributed_capital',
    label: 'Contributed Capital',
    account_element_id: accountElementIds.capital,
    description: 'Share capital, premium, APIC, other direct contributions from owners',
    report_code: 'BS.EQU.CAP.CAP',
  },
  {
    id: '8f84a613-1b9b-412b-a29e-168e542b7467',
    key: 'eq_retained_earnings',
    label: 'Retained Earnings',
    account_element_id: accountElementIds.reserves,
    description: 'Accumulated net income retained in the business after dividends are paid',
    report_code: 'BS.EQU.RES.RET',
  },
  {
    id: 'f1ee9996-005d-4b7d-804d-9c61437f9f82',
    key: 'eq_oci',
    label: 'Other Comprehensive Income (AOCI)',
    account_element_id: accountElementIds.reserves,
    description: 'Accumulated Other Comprehensive Income',
    report_code: 'BS.EQU.RES.OCI',
  },
  {
    id: '230cef7a-ed92-4eef-b76b-2b7cbfa43d6c',
    key: 'eq_other',
    label: 'Other Components of Equity',
    account_element_id: accountElementIds.otherEquity,
    description:
      'Equity components that do not fall under contributed capital, retained earnings, or OCI',
    report_code: 'BS.EQU.OTH.OTH',
  },
];
const defaultIncomeTypes: AccountTypeWithRequiredReportCode[] = [
  {
    id: '16527f50-d94a-4fb5-bdfb-86ad51ebaa7e',
    key: 'rev_revenue',
    label: 'Revenue',
    account_element_id: accountElementIds.revenue,
    description: 'All income generated from the business’s main operations',
    report_code: 'IS.INC.REV.REV',
  },
  {
    id: '89028f2e-2935-4d6f-add6-bed5354d2f50',
    key: 'rev_contra',
    label: 'Contra Revenue',
    account_element_id: accountElementIds.contraRevenue,
    description: 'Reductions to revenue due to returns, discounts, or credits',
    report_code: 'IS.INC.REV.REV.CTR',
  },
  {
    id: '3901ec6d-91b5-449b-8805-e71526dd8450',
    key: 'rev_finance_income',
    label: 'Finance Income',
    account_element_id: accountElementIds.otherIncome,
    description: 'Non-operating Interest earned, dividends, gains on financial instruments',
    report_code: 'IS.INC.OTH.FIN',
  },
  {
    id: '6760059c-be41-4d66-bb1d-d1cb5994588b',
    key: 'rev_other_income',
    label: 'Other Income',
    account_element_id: accountElementIds.otherIncome,
    description: 'Miscellaneous income such as asset sales, grants, or one-time gains',
    report_code: 'IS.INC.OTH.OTH',
  },
];
const defaultExpenseTypes: AccountTypeWithRequiredReportCode[] = [
  {
    id: '605362fc-58e5-436d-805e-008d6313f4bb',
    key: 'exp_cos',
    label: 'Cost of sales',
    account_element_id: accountElementIds.costOfSales,
    description: 'Direct costs incurred in the production or acquisition of goods sold',
    report_code: 'IS.EXP.COS.COS',
  },
  {
    id: 'a1a658a0-7b31-4f2b-b5d0-978da055763c',
    key: 'exp_opex_employee_benefits',
    label: 'Employee Benefits',
    account_element_id: accountElementIds.opex,
    description:
      'Wages, salaries, and benefits paid to employees, including bonuses, pensions, health insurance',
    report_code: 'IS.EXP.OPX.EMP',
  },
  {
    id: '23b862cb-00cd-463b-8efb-b1e68ee3c3fa',
    key: 'exp_opex_marketing_selling',
    label: 'Marketing and Selling',
    account_element_id: accountElementIds.opex,
    description: "Costs associated with promoting the company's products or services",
    report_code: 'IS.EXP.OPX.MKT',
  },
  {
    id: '9458fa43-3c15-4e63-918d-8c54ad1b3fcd',
    key: 'exp_opex_rent',
    label: 'Rent',
    account_element_id: accountElementIds.opex,
    description:
      'Payments for the use of real estate or property, including office, retail, or warehouse spaces',
    report_code: 'IS.EXP.OPX.RNT',
  },
  {
    id: '5e00bbdf-a6a0-4c4a-b0d8-9d7117138b8e',
    key: 'exp_opex_insurance',
    label: 'Insurance',
    account_element_id: accountElementIds.opex,
    description:
      "Premiums paid for business insurance coverage, including liability, property, health, and workers' compensation",
    report_code: 'IS.EXP.OPX.INS',
  },
  {
    id: '161369ce-aebb-48b6-b350-0f097d252895',
    key: 'exp_opex_utilities',
    label: 'Utilities',
    account_element_id: accountElementIds.opex,
    description:
      'Recurring costs for electricity, water, gas, and waste disposal essential to business operations',
    report_code: 'IS.EXP.OPX.UTL',
  },
  {
    id: '7b683e39-579b-475f-bed6-0313735b8082',
    key: 'exp_opex_repairs',
    label: 'Repairs and Maintenance',
    account_element_id: accountElementIds.opex,
    description: 'Costs for maintaining and repairing company-owned assets',
    report_code: 'IS.EXP.OPX.RPR',
  },
  {
    id: '27d0095c-b6d9-436e-889e-28a336a60227',
    key: 'exp_opex_professional_fees',
    label: 'Professional Fees',
    account_element_id: accountElementIds.opex,
    description: 'Fees paid to external professionals, such as lawyers and consultants',
    report_code: 'IS.EXP.OPX.PRF',
  },
  {
    id: '9a03e2e3-9b78-4cc7-ba42-54125ea61d3b',
    key: 'exp_opex_tel_internet',
    label: 'Telephone and Internet Expenses',
    account_element_id: accountElementIds.opex,
    description:
      'Expenses for landline, mobile, and internet services used in business communication and operations',
    report_code: 'IS.EXP.OPX.TEL',
  },
  {
    id: '57b361b5-4a6e-4f28-ad1f-be9bf615066b',
    key: 'exp_opex_software_subscriptions',
    label: 'IT Software, Subscriptions and Consumables',
    account_element_id: accountElementIds.opex,
    description: 'Costs of cloud software, SaaS tools, licensing fees and general IT consumables',
    report_code: 'IS.EXP.OPX.SFT',
  },
  {
    id: '9261acd9-ab25-4804-bc89-7581223b1fb8',
    key: 'exp_opex_travel',
    label: 'Transport and Travel',
    account_element_id: accountElementIds.opex,
    description: 'Expenses related to employee transportation and business travel',
    report_code: 'IS.EXP.OPX.TRV',
  },
  {
    id: '79170de2-df5f-4ef3-ab13-9260e0d5fe0d',
    key: 'exp_opex_depreciation_amortization',
    label: 'Depreciation and Amortization',
    account_element_id: accountElementIds.opex,
    description:
      'The allocation of the cost of tangible and intangible assets over their useful life',
    report_code: 'IS.EXP.OPX.DEP',
  },
  {
    id: '1c06789d-ccd5-407e-af5f-abbec6c5745a',
    key: 'exp_opex_memberships',
    label: 'Memberships, Subscriptions & Dues',
    account_element_id: accountElementIds.opex,
    description:
      'Membership fees, regulatory licenses, and subscriptions to trade bodies or industry organizations',
    report_code: 'IS.EXP.OPX.MEM',
  },
  {
    id: 'dfd8c5bb-3b03-4466-88c7-c4075c419d86',
    key: 'exp_opex_other',
    label: 'Other Administrative Expenses',
    account_element_id: accountElementIds.opex,
    description: 'Miscellaneous expenses related to the general running of the business',
    report_code: 'IS.EXP.OPX.OTH',
  },
  {
    id: '3a2a0a25-cd2c-4b9b-baf2-b3a46d78c2be',
    key: 'exp_nopex_finance_costs',
    label: 'Finance Costs',
    account_element_id: accountElementIds.nonOpex,
    description: 'Costs incurred from borrowing funds, including interest and other charges',
    report_code: 'IS.EXP.NOP.FIN',
  },
  {
    id: 'cfcd5b51-348b-4b92-8045-dc6485bca69e',
    key: 'exp_nopex_other',
    label: 'Other Non-Operating Expenses',
    account_element_id: accountElementIds.nonOpex,
    description: 'Expenses not related to core business operations',
    report_code: 'IS.EXP.NOP.OTH',
  },
  {
    id: '26d7dc5c-e1f7-4159-8786-dac74a0f20d1',
    key: 'exp_nopex_tax',
    label: 'Tax Expense',
    account_element_id: accountElementIds.nonOpex,
    description: 'Income taxes payable by the company on its earnings',
    report_code: 'IS.EXP.NOP.TAX',
  },
];

const defaultAccountTypes: AccountTypeWithRequiredReportCode[] = [
  ...defaultNonCurrentAssetTypes,
  ...defaultCurrentAssetTypes,
  ...defaultNonCurrentLiabilityTypes,
  ...defaultCurrentLiabilityTypes,
  ...defaultEquityTypes,
  ...defaultIncomeTypes,
  ...defaultExpenseTypes,
];

const tableName = 'account_types';

const seedAccountTypes = async function seed(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx(tableName).insert(defaultAccountTypes).onConflict().ignore();

    if (NODE_ENV === 'local' || NODE_ENV === 'docker') {
      console.log(`Seeded ${defaultAccountTypes.length} account types`);
    }
  });
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('key', 64).unique().notNullable();
    table.string('label', 256).notNullable();
    table.string('description', 512).nullable();
    table.string('report_code', 64).nullable();

    table
      .uuid('account_element_id')
      .notNullable()
      .references('id')
      .inTable('account_elements')
      .onDelete('RESTRICT');

    addStandardColumns(table);

    table.index(['account_element_id'], 'account_type_element_idx');
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await preventUpdateOrDelete(knex, tableName);
  await seedAccountTypes(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
