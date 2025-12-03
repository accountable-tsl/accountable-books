import { type AccountTypeWithRequiredReportCode } from '../../../schema/source/index.js';
import { accountElementIds } from './account-element-id.js';

export const defaultNonCurrentAssetTypes: AccountTypeWithRequiredReportCode[] =
  [
    {
      id: '645e5c04-7638-49ed-aabd-6bce8b089a17',
      key: 'nca_land', //nca - non current asset
      label: 'Land',
      account_element_id: accountElementIds.nonCurrentAsset,
      description:
        'Freehold or leasehold land held for operations or investment; not depreciated',
      report_code: 'BS.ASS.NCA.LND',
      label_role: 'semantic',
      trainable: true,
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: '9d8e5ec9-e9b7-43d6-8dde-b80a552fb64e',
      key: 'nca_ppe', //nca - non current asset
      label: 'Property, Plant, Equipment',
      account_element_id: accountElementIds.nonCurrentAsset,
      description:
        'Tangible long-term assets used in operations (e.g., buildings, machinery, vehicles)',
      report_code: 'BS.ASS.NCA.PPE',
      label_role: 'semantic',
      trainable: true,
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: '276ef71c-10b1-44d2-a6ce-23752b047949',
      key: 'nca_ppe_contra',
      label: 'Contra Property, Plant, Equipment',
      account_element_id: accountElementIds.contraAsset,
      description:
        'Accumulated depreciation reducing the carrying amount of PPE',
      report_code: 'BS.ASS.NCA.PPE.CTR',
      label_role: 'mechanical',
      trainable: false,
      is_contra: true,
      is_postable_control: false,
    },
    {
      id: 'f3e9e2a4-6b0a-4d1d-8c9e-3f6f6c1b3c4d',
      key: 'nca_investment_property', //nca - non current asset
      label: 'Investment Property',
      account_element_id: accountElementIds.nonCurrentAsset,
      description:
        'Property (land or a building or part of a building or both) held to earn rentals or for capital appreciation or both',
      report_code: 'BS.ASS.NCA.IVP',
      label_role: 'semantic',
      trainable: true,
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: '20be47b9-6069-4143-ae72-266f6e0f2f84',
      key: 'nca_investment_property_contra',
      label: 'Contra Investment Property',
      account_element_id: accountElementIds.contraAsset,
      description:
        'Accumulated depreciation/amortization/fair-value adjustments contra to Investment Property',
      report_code: 'BS.ASS.NCA.IVP.CTR',
      label_role: 'mechanical',
      trainable: false,
      is_contra: true,
      is_postable_control: false,
    },
    {
      id: '620cb7cb-6283-48d7-840b-81f4b23419f4',
      key: 'nca_rou_asset',
      label: 'Right-of-Use Assets',
      account_element_id: accountElementIds.nonCurrentAsset,
      description:
        'Right-of-use assets from long-term leases (IFRS 16 or ASC 842)',
      report_code: 'BS.ASS.NCA.ROU',
      label_role: 'semantic',
      trainable: true,
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: '4d6d0cb4-66de-4285-9eb4-eec81de03cfc',
      key: 'nca_rou_asset_contra',
      label: 'Contra Right-of-Use Assets',
      account_element_id: accountElementIds.contraAsset,
      description:
        'Accumulated depreciation or amortization of right of use assets',
      report_code: 'BS.ASS.NCA.ROU.CTR',
      label_role: 'mechanical',
      trainable: false,
      is_contra: true,
      is_postable_control: false,
    },
    {
      id: '50a5d1ca-5219-4d43-903e-8d926067a0f1',
      key: 'nca_intangible_asset',
      label: 'Intangible Assets',
      account_element_id: accountElementIds.nonCurrentAsset,
      description:
        'Identifiable non-physical assets (e.g., software, patents, trademarks)',
      report_code: 'BS.ASS.NCA.INT',
      label_role: 'semantic',
      trainable: true,
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: '7aac324c-1205-477e-a084-112de81c4152',
      key: 'nca_intangible_asset_contra',
      label: 'Contra Intangible Assets',
      account_element_id: accountElementIds.contraAsset,
      description:
        'Accumulated amortization reducing the carrying amount of intangibles',
      report_code: 'BS.ASS.NCA.INT.CTR',
      label_role: 'mechanical',
      trainable: false,
      is_contra: true,
      is_postable_control: false,
    },
    {
      id: '0bbb12c0-ebe3-4ad6-879f-c277ed862ad2',
      key: 'nca_other',
      label: 'Other Non-current Assets',
      account_element_id: accountElementIds.nonCurrentAsset,
      description:
        'Long-term assets not classified elsewhere, including deferred tax assets and long-term investments',
      report_code: 'BS.ASS.NCA.OTH',
      label_role: 'fallback',
      // We are starting cautious so trainable false coz this bucket is broad; we'd turn on once we have enough clean examples that justify.
      trainable: false,
      is_contra: false,
      is_postable_control: false,
    },
  ];

export const defaultCurrentAssetTypes: AccountTypeWithRequiredReportCode[] = [
  {
    id: 'd9c4adcd-add7-4602-a1bc-1edad19da4f0',
    key: 'ca_bank',
    label: 'Bank',
    account_element_id: accountElementIds.currentAsset,
    description:
      'Cash and demand deposits held in bank and petty cash accounts',
    report_code: 'BS.ASS.CUR.BNK',
    default_monetary: true,
    label_role: 'control',
    trainable: false,
    is_contra: false,
    is_postable_control: true, // templates post here for the bank leg
  },
  {
    id: '4a5d0024-6234-4982-809c-f16e3be7f379',
    key: 'ca_cash_equivalent',
    label: 'Cash Equivalents',
    account_element_id: accountElementIds.currentAsset,
    description:
      'Highly liquid short-term investments readily convertible to known amounts of cash',
    report_code: 'BS.ASS.CUR.CEQ',
    default_monetary: true,
    label_role: 'control', // treated operationally like cash in posting flows
    trainable: false,
    is_contra: false,
    is_postable_control: true,
  },
  {
    id: '10149b24-6827-475d-a657-77497c0856a0',
    key: 'ca_inventory',
    label: 'Inventory',
    account_element_id: accountElementIds.currentAsset,
    description:
      'Goods held for sale and production, raw materials, work-in-progress, and finished goods',
    report_code: 'BS.ASS.CUR.INV',
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
  },
  {
    id: 'c26e7b85-92c1-4555-8b1a-d394376a64cb',
    key: 'ca_inventory_contra',
    label: 'Contra Inventory',
    account_element_id: accountElementIds.contraAsset,
    description:
      'Adjustments reducing inventory carrying amount, often reflecting returns, allowances, or obsolescence e.g Inventory Obsolescence Reserves',
    report_code: 'BS.ASS.CUR.INV.CTR',
    label_role: 'mechanical',
    trainable: false,
    is_contra: true,
    is_postable_control: false,
  },
  {
    id: 'd764021a-0847-4be8-a687-9c8195b47f6d',
    key: 'ca_trade_receivable',
    label: 'Trade Receivables',
    account_element_id: accountElementIds.currentAsset,
    description:
      'Amounts due from customers for goods or services provided on credit (AR Control)',
    report_code: 'BS.ASS.CUR.TRC',
    default_monetary: true,
    label_role: 'control',
    trainable: false,
    is_contra: false,
    is_postable_control: true, // templates post here for AR collections
  },
  {
    id: '083d362e-2715-4556-922a-c86a6966bb98',
    key: 'ca_trade_receivable_contra',
    label: 'Allowance for doubtful accounts',
    account_element_id: accountElementIds.contraAsset,
    description:
      'Expected credit loss allowance reducing AR to net realizable value',
    report_code: 'BS.ASS.CUR.TRC.CTR',
    label_role: 'mechanical',
    trainable: false,
    is_contra: true,
    is_postable_control: false,
  },
  {
    id: '6c1d4db4-2f10-4c82-9ffa-a4a18e80a3ef',
    key: 'ca_contract_asset',
    label: 'Contract Assets',
    account_element_id: accountElementIds.currentAsset,
    description:
      'Unbilled consideration for performance completed (IFRS 15/ASC 606)',
    report_code: 'BS.ASS.CUR.CTA',
    label_role: 'semantic',
    // Usually not the target of bank-feed postings; we'll flip to true once we have clean labels.
    trainable: false,
    is_contra: false,
    is_postable_control: false,
  },
  {
    id: 'a0328b6e-4257-435f-9533-53ed9ccc2bf2',
    key: 'ca_prepayment',
    label: 'Prepayments',
    account_element_id: accountElementIds.currentAsset,
    description:
      'Advance payments for goods/services (recognized as expense over time)',
    report_code: 'BS.ASS.CUR.PRP',
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
  },
  {
    id: '1db337dc-9a0e-48d7-84c8-35e1ca098ef6',
    key: 'ca_due_from_related_party',
    label: 'Due from Related Parties',
    account_element_id: accountElementIds.currentAsset,
    description:
      'Amounts receivable from directors, shareholders, affiliates (loans/advances)',
    report_code: 'BS.ASS.CUR.RPA',
    default_monetary: true,
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
  },
  {
    id: '176abf7d-d7d2-46fe-8981-5f3e1ddcf880',
    key: 'ca_other_receivable',
    label: 'Other Receivables',
    account_element_id: accountElementIds.currentAsset,
    description:
      'Non-trade receivables, (e.g tax refunds, interest receivables )',
    report_code: 'BS.ASS.CUR.OTR',
    default_monetary: true,
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
  },
  {
    id: '140e3f60-337b-4bf2-b42d-3c7f37dea88f',
    key: 'ca_other',
    label: 'Other Current Assets',
    account_element_id: accountElementIds.currentAsset,
    description:
      'Short-term assets not classified elsewhere, typically convertible to cash within one year',
    report_code: 'BS.ASS.CUR.OTH',
    label_role: 'fallback',
    // Broad/ambiguous bucket—start untrainable to avoid noisy labels.
    trainable: false,
    is_contra: false,
    is_postable_control: false,
  },
];
export const defaultNonCurrentLiabilityTypes: AccountTypeWithRequiredReportCode[] =
  [
    {
      id: '384e10f1-d5a1-429a-86c9-dfc6dc1760c6',
      key: 'ncl_long_term_debt',
      label: 'Long-Term Debt',
      account_element_id: accountElementIds.nonCurrentLiabilities,
      description:
        'Borrowings due beyond one year (e.g., term loans, mortgages)',
      report_code: 'BS.LIA.NCL.DBT',
      default_monetary: true,
      label_role: 'semantic',
      trainable: true, // bank feeds can hit principal (proceeds/repayments)
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: '5d8a18a7-477a-402c-8aca-f067cfe65520',
      key: 'ncl_long_term_debt_contra',
      label: 'Debt Discounts',
      account_element_id: accountElementIds.contraLiabilities,
      description:
        'Contra to debt (discount/premium, issuance costs) reducing carrying amount; amortized over time',
      report_code: 'BS.LIA.NCL.DBT.CTR',
      label_role: 'mechanical', // posted by amortization engine, not bank-feed classifier
      trainable: false,
      is_contra: true,
      is_postable_control: false,
    },
    {
      id: '127795fb-dba2-492e-8da4-0152854c7613',
      key: 'ncl_long_term_lease',
      label: 'Long-Term Lease Liabilities',
      account_element_id: accountElementIds.nonCurrentLiabilities,
      description: 'Lease obligations beyond one year (IFRS 16 / ASC 842)',
      report_code: 'BS.LIA.NCL.LSE',
      default_monetary: true,
      label_role: 'semantic',
      trainable: true, // lease payments can map to principal portion
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: 'd01e3dfc-553b-4846-bd44-1078f94c43ee',
      key: 'ncl_other',
      label: 'Other Non-current Liabilities',
      account_element_id: accountElementIds.nonCurrentLiabilities,
      description:
        'Long-term liabilities not elsewhere classified (e.g., deferred tax, warranties, pensions)',
      report_code: 'BS.LIA.NCL.OTH',
      label_role: 'fallback',
      trainable: false, // broad/ambiguous; enable after curated labels
      is_contra: false,
      is_postable_control: false,
    },
  ];
export const defaultCurrentLiabilityTypes: AccountTypeWithRequiredReportCode[] =
  [
    {
      id: '7def2082-8695-4d32-a385-2827e46747db',
      key: 'cl_trade_payable',
      label: 'Trade Payables',
      account_element_id: accountElementIds.currentLiabilities,
      description:
        'Amounts owed to suppliers for purchases on credit (AP control)',
      report_code: 'BS.LIA.CUR.TRP',
      default_monetary: true,
      label_role: 'control',
      trainable: false,
      is_contra: false,
      is_postable_control: true, // templates post here for AP payments
    },
    {
      id: '7865e860-7bda-4a6c-95dc-f48dde645155',
      key: 'cl_payroll_payables',
      label: 'Payroll Payables',
      account_element_id: accountElementIds.currentLiabilities,
      description:
        'Net salaries and payroll-related amounts owed to employees (excluding taxes and pensions), pending payment',
      report_code: 'BS.LIA.CUR.PAY',
      default_monetary: true,
      label_role: 'semantic',
      trainable: true, // bank feed can hit it
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: '62f3de64-02ad-4ec3-b409-623b77023946',
      key: 'cl_accrued_professional_fees',
      label: 'Accrued Professional Fees',
      account_element_id: accountElementIds.currentLiabilities,
      description:
        'Fees incurred for audit, legal, consulting, HR, etc., not yet invoiced/paid',
      report_code: 'BS.LIA.CUR.APF',
      default_monetary: true,
      label_role: 'semantic',
      trainable: true,
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: 'd1fd95a8-bde9-4a72-a342-b261c0cddb91',
      key: 'cl_accrued_finance_cost',
      label: 'Accrued Finance Cost',
      account_element_id: accountElementIds.currentLiabilities,
      description:
        'Interest and similar finance costs accrued but not yet paid',
      report_code: 'BS.LIA.CUR.AFI',
      default_monetary: true,
      label_role: 'semantic',
      trainable: false, // start off false, bank feeds usually settle expense not the accrual
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: '875f8208-ba6d-466e-a0fc-0e398f7cd833',
      key: 'cl_accrued_opex',
      label: 'Accrued Operating Expenses',
      account_element_id: accountElementIds.currentLiabilities,
      description:
        'Operating expenses incurred (rent, utilities, facilities, IT) not yet invoiced/paid',
      report_code: 'BS.LIA.CUR.AOP',
      default_monetary: true,
      label_role: 'semantic',
      trainable: true,
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: 'be425527-419e-4f1c-9ab6-61eae841758d',
      key: 'cl_accrued_misc', // cl_accrued_expenses
      label: 'Misc. Accrued Expenses',
      account_element_id: accountElementIds.currentLiabilities,
      description:
        'Fallback accrual bucket for miscellaneous items not yet invoiced/paid (non-cash recognition)',
      report_code: 'BS.LIA.CUR.ACC',
      default_monetary: true,
      label_role: 'mechanical', // created/cleared by accrual workflows, not bank-classifier
      trainable: false,
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: '00ec4957-593e-47e9-b231-c7bab4c32a0d',
      key: 'cl_other_payables',
      label: 'Other Payables',
      account_element_id: accountElementIds.currentLiabilities,
      description:
        'Short-term obligations outside AP/accruals (e.g., sundry/statutory)',
      report_code: 'BS.LIA.CUR.OPY',
      default_monetary: true,
      label_role: 'semantic',
      // Broad bucket—start untrainable to avoid noise; enable per-tenant curation.
      trainable: false,
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: 'f7e721d0-9912-402e-8746-7e9ef55f6cde',
      key: 'cl_contract_liabilities',
      label: 'Contract Liabilities',
      account_element_id: accountElementIds.currentLiabilities,
      description:
        'Customer prepayments/deferred revenue for goods/services to be delivered',
      report_code: 'BS.LIA.CUR.CTL',
      default_monetary: true,
      label_role: 'semantic', // advances from customers can come via bank feeds
      trainable: true,
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: 'e4d6a7c6-0a5f-4f2c-8a4d-3f9e3d3f9e3d',
      key: 'cl_due_to_related_parties',
      label: 'Due to Related Parties',
      account_element_id: accountElementIds.currentLiabilities,
      description:
        'Amounts payable to directors/shareholders/affiliates (loans/advances)',
      report_code: 'BS.LIA.CUR.RPL',
      default_monetary: true,
      label_role: 'semantic',
      trainable: true, // bank inflows/outflows can hit here
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: '7780f7f0-ad31-44b7-acd1-d39a0a6c01a1',
      key: 'cl_short_term_debt',
      label: 'Short-Term Debt',
      account_element_id: accountElementIds.currentLiabilities,
      description:
        'Borrowings due within one year (overdrafts, short-term credit lines)',
      report_code: 'BS.LIA.CUR.STD',
      default_monetary: true,
      label_role: 'semantic',
      trainable: true, // loan proceeds/repayments may target ST debt
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: 'de69a07e-18f4-49b9-9bc8-265cffd6ca14',
      key: 'cl_short_term_debt_contra',
      label: 'Debt Discounts - Short-Term Debt',
      account_element_id: accountElementIds.contraLiabilities,
      description:
        'Contra to short-term debt (issuance costs/discounts) amortized over time',
      report_code: 'BS.LIA.CUR.STD.CTR',
      label_role: 'mechanical',
      trainable: false,
      is_contra: true,
      is_postable_control: false,
    },
    {
      id: '54506f3f-d065-4068-9b1c-ea81d231543f',
      key: 'cl_tax',
      label: 'Tax Payable',
      account_element_id: accountElementIds.currentLiabilities,
      description:
        'Taxes due within one year (e.g., VAT/WHT/income tax control)',
      report_code: 'BS.LIA.CUR.TAX',
      default_monetary: true,
      label_role: 'control', // remittance postings target this via templates
      trainable: false,
      is_contra: false,
      is_postable_control: true,
    },
    {
      id: '105e8efd-77e4-4572-8dc6-c56d404ce018',
      key: 'cl_current_debt_portion',
      label: 'Current Portion of Long-Term Debt',
      account_element_id: accountElementIds.currentLiabilities,
      description:
        'Principal due within one year on long-term borrowings (schedule-driven)',
      report_code: 'BS.LIA.CUR.CPF',
      default_monetary: true,
      label_role: 'mechanical', // split allocated by schedules/templates, not classifier
      trainable: false,
      is_contra: false,
      is_postable_control: false,
    },
    {
      id: '7a9cea0c-223f-4854-8344-1ceee1436ed3',
      key: 'cl_other',
      label: 'Other Current Liabilities',
      account_element_id: accountElementIds.currentLiabilities,
      description: 'Short-term obligations not classified elsewhere',
      report_code: 'BS.LIA.CUR.OTH',
      label_role: 'semantic',
      trainable: false, // keepin' off until curated subclasses exist
      is_contra: false,
      is_postable_control: false,
    },
  ];
export const defaultEquityTypes: AccountTypeWithRequiredReportCode[] = [
  {
    id: '39a0bb4a-fae3-4eab-bdac-fcf2794476a5',
    key: 'eq_contributed_capital',
    label: 'Contributed Capital',
    account_element_id: accountElementIds.capital,
    description:
      'Share capital, premium, APIC, other direct contributions from owners',
    report_code: 'BS.EQU.CAP.CAP',
    default_monetary: false,
    label_role: 'mechanical',
    trainable: false,
    is_contra: false,
    is_postable_control: false,
  },
  {
    id: '8f84a613-1b9b-412b-a29e-168e542b7467',
    key: 'eq_retained_earnings',
    label: 'Retained Earnings',
    account_element_id: accountElementIds.reserves,
    description:
      'Accumulated net income retained in the business after dividends are paid',
    report_code: 'BS.EQU.RES.RET',
    label_role: 'mechanical',
    trainable: false,
    is_contra: false,
    is_postable_control: false,
  },
  {
    id: 'f1ee9996-005d-4b7d-804d-9c61437f9f82',
    key: 'eq_oci',
    label: 'Other Comprehensive Income (AOCI)',
    account_element_id: accountElementIds.reserves,
    description:
      'Accumulated Other Comprehensive Income (FVOCI, FX translation adjustments etc.)',
    report_code: 'BS.EQU.RES.OCI',
    label_role: 'mechanical',
    trainable: false,
    is_contra: false,
    is_postable_control: false,
  },
  {
    id: '230cef7a-ed92-4eef-b76b-2b7cbfa43d6c',
    key: 'eq_other',
    label: 'Other Components of Equity',
    account_element_id: accountElementIds.otherEquity,
    description:
      'Equity components that do not fall under contributed capital, retained earnings, or OCI',
    report_code: 'BS.EQU.OTH.OTH',
    label_role: 'mechanical',
    trainable: false,
    is_contra: false,
    is_postable_control: false,
  },
];
export const defaultIncomeTypes: AccountTypeWithRequiredReportCode[] = [
  {
    id: '16527f50-d94a-4fb5-bdfb-86ad51ebaa7e',
    key: 'rev_revenue',
    label: 'Revenue',
    account_element_id: accountElementIds.revenue,
    description: 'All income generated from the business’s main operations',
    report_code: 'IS.INC.REV.REV',
    label_role: 'semantic',
    trainable: true, // bank receipts can map here if no AR flow
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['cl_contract_liabilities', 'ca_trade_receivable'], // customer prepayments -> deferred revenue, AR collections -> receivables; industry or history might help here.
  },
  {
    id: '89028f2e-2935-4d6f-add6-bed5354d2f50',
    key: 'rev_contra',
    label: 'Contra Revenue',
    account_element_id: accountElementIds.contraRevenue,
    description: 'Reductions to revenue due to returns, discounts, or credits',
    report_code: 'IS.INC.REV.REV.CTR',
    label_role: 'mechanical',
    trainable: false,
    is_contra: true,
    is_postable_control: false,
  },
  {
    id: '3901ec6d-91b5-449b-8805-e71526dd8450',
    key: 'rev_finance_income',
    label: 'Finance Income',
    account_element_id: accountElementIds.otherIncome,
    description:
      'Interest/dividend/gain income not tied to core business operations',
    report_code: 'IS.INC.OTH.FIN',
    label_role: 'mechanical',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
  },
  {
    id: '6760059c-be41-4d66-bb1d-d1cb5994588b',
    key: 'rev_other_income',
    label: 'Other Income',
    account_element_id: accountElementIds.otherIncome,
    description:
      'Misc. or one-off income (asset sales, grants, rebates, insurance recoveries)',
    report_code: 'IS.INC.OTH.OTH',
    label_role: 'semantic',
    trainable: false,
    is_contra: false,
    is_postable_control: false,
    accrual_targets: [
      'ca_other_receivable',
      'ca_trade_receivable',
      'cl_contract_liabilities',
    ], // most other income are payments companies expect from say investments, tax refunds, etc.
  },
];
export const defaultExpenseTypes: AccountTypeWithRequiredReportCode[] = [
  {
    id: '605362fc-58e5-436d-805e-008d6313f4bb',
    key: 'exp_cos',
    label: 'Cost of sales',
    account_element_id: accountElementIds.costOfSales,
    description:
      'Direct costs incurred in the production or acquisition of goods sold',
    report_code: 'IS.EXP.COS.COS',
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['cl_trade_payable'], // Postings should mostly not touch cos though. But if they do, payables is the most likely accrual target.
  },
  {
    id: 'a1a658a0-7b31-4f2b-b5d0-978da055763c',
    key: 'exp_opex_employee_benefits',
    label: 'Employee Benefits',
    account_element_id: accountElementIds.opex,
    description:
      'Wages, salaries, and benefits paid to employees, including bonuses, pensions, health insurance',
    report_code: 'IS.EXP.OPX.EMP',
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['cl_payroll_payables'],
  },
  {
    id: '23b862cb-00cd-463b-8efb-b1e68ee3c3fa',
    key: 'exp_opex_marketing_selling',
    label: 'Marketing and Selling',
    account_element_id: accountElementIds.opex,
    description:
      "Costs associated with promoting the company's products or services",
    report_code: 'IS.EXP.OPX.MKT',
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['cl_accrued_opex'],
  },
  {
    id: '9458fa43-3c15-4e63-918d-8c54ad1b3fcd',
    key: 'exp_opex_rent',
    label: 'Rent',
    account_element_id: accountElementIds.opex,
    description:
      'Payments for the use of real estate or property, including office, retail, or warehouse spaces',
    report_code: 'IS.EXP.OPX.RNT',
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['ca_prepayment'], // rent is often prepaid
  },
  {
    id: '5e00bbdf-a6a0-4c4a-b0d8-9d7117138b8e',
    key: 'exp_opex_insurance',
    label: 'Insurance',
    account_element_id: accountElementIds.opex,
    description:
      "Premiums paid for business insurance coverage, including liability, property, health, and workers' compensation",
    report_code: 'IS.EXP.OPX.INS',
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['ca_prepayment'], // insurance is often prepaid
  },
  {
    id: '161369ce-aebb-48b6-b350-0f097d252895',
    key: 'exp_opex_utilities',
    label: 'Utilities',
    account_element_id: accountElementIds.opex,
    description:
      'Recurring costs for electricity, water, gas, and waste disposal essential to business operations',
    report_code: 'IS.EXP.OPX.UTL',
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['cl_accrued_opex'], // utilities are often accrued
  },
  {
    id: '7b683e39-579b-475f-bed6-0313735b8082',
    key: 'exp_opex_repairs',
    label: 'Repairs and Maintenance',
    account_element_id: accountElementIds.opex,
    description: 'Costs for maintaining and repairing company-owned assets',
    report_code: 'IS.EXP.OPX.RPR',
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['cl_accrued_opex'],
  },
  {
    id: '27d0095c-b6d9-436e-889e-28a336a60227',
    key: 'exp_opex_professional_fees',
    label: 'Professional Fees',
    account_element_id: accountElementIds.opex,
    description:
      'Fees paid to external professionals, such as lawyers and consultants',
    report_code: 'IS.EXP.OPX.PRF',
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['cl_accrued_professional_fees', 'cl_accrued_opex'], // specific first, then fallback
  },
  {
    id: '9a03e2e3-9b78-4cc7-ba42-54125ea61d3b',
    key: 'exp_opex_tel_internet',
    label: 'Telephone and Internet Expenses',
    account_element_id: accountElementIds.opex,
    description:
      'Expenses for landline, mobile, and internet services used in business communication and operations',
    report_code: 'IS.EXP.OPX.TEL',
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['ca_prepayment', 'cl_accrued_opex'], // most telecoms are on the fly, maybe we look at the value to determine. smes often pay in advance though.
  },
  {
    id: '57b361b5-4a6e-4f28-ad1f-be9bf615066b',
    key: 'exp_opex_software_subscriptions',
    label: 'IT Software, Subscriptions and Consumables',
    account_element_id: accountElementIds.opex,
    description:
      'Costs of cloud software, SaaS tools, licensing fees and general IT consumables',
    report_code: 'IS.EXP.OPX.SFT',
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['ca_prepayment'], // many software subscriptions are prepaid
  },
  {
    id: '9261acd9-ab25-4804-bc89-7581223b1fb8',
    key: 'exp_opex_travel',
    label: 'Transport and Travel',
    account_element_id: accountElementIds.opex,
    description:
      'Expenses related to employee transportation and business travel',
    report_code: 'IS.EXP.OPX.TRV',
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['cl_accrued_opex'], // typically reimbursed or accrued
  },
  {
    id: '79b38f3a-a0b0-41c9-96e6-2e0acbce35ab',
    key: 'exp_opex_bank_fees',
    label: 'Bank Fees and Charges',
    account_element_id: accountElementIds.opex,
    description: 'Bank service charges, card fees, and similar charges.',
    report_code: 'IS.EXP.OPX.BNK',
    default_monetary: false,
    label_role: 'semantic',
    trainable: true, // very common bank memo class
    is_contra: false,
    is_postable_control: false,
    // no accruals here; bank fees are posted on the fly
  },
  {
    id: '053b1052-4a70-42c6-98ab-8f55c95f6595',
    key: 'exp_opex_rnd',
    label: 'Research & Development',
    account_element_id: accountElementIds.opex,
    description: 'R&D activities; expense or capitalize per policy.',
    report_code: 'IS.EXP.OPX.RND',
    default_monetary: false,
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['cl_accrued_opex', 'cl_accrued_misc'],
  },
  {
    id: '79170de2-df5f-4ef3-ab13-9260e0d5fe0d',
    key: 'exp_opex_depreciation_amortization',
    label: 'Depreciation and Amortization',
    account_element_id: accountElementIds.opex,
    description:
      'The allocation of the cost of tangible and intangible assets over their useful life',
    report_code: 'IS.EXP.OPX.DEP',
    label_role: 'mechanical',
    trainable: false,
    is_contra: false,
    is_postable_control: false,
    // Mechanical only
  },
  {
    id: '1c06789d-ccd5-407e-af5f-abbec6c5745a',
    key: 'exp_opex_memberships',
    label: 'Memberships, Subscriptions & Dues',
    account_element_id: accountElementIds.opex,
    description:
      'Membership fees, regulatory licenses, and subscriptions to trade bodies or industry organizations',
    report_code: 'IS.EXP.OPX.MEM',
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['ca_prepayment', 'cl_accrued_opex'], // many memberships are prepaid but people owe too
  },
  {
    id: 'ea13393e-62f4-4a6b-8bcc-2a08b6d76974',
    key: 'exp_opex_office_supplies',
    label: 'Office Supplies & Stationery',
    account_element_id: accountElementIds.opex,
    description:
      'Office consumables: paper, printing, stationery, small tools.',
    report_code: 'IS.EXP.OPX.OFF',
    default_monetary: false,
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['cl_accrued_opex'],
  },
  {
    id: '3e93c880-c39e-4fb0-9e63-20955e3e1f52',
    key: 'exp_nopex_donations',
    label: 'Charitable Donations',
    account_element_id: accountElementIds.nonOpex,
    description: 'Donations and charitable contributions.',
    report_code: 'IS.EXP.NOP.DON',
    default_monetary: false,
    label_role: 'semantic',
    trainable: true,
    is_contra: false,
    is_postable_control: false,
    // No meaningful deterministic accrual treatment
  },
  {
    id: 'dfd8c5bb-3b03-4466-88c7-c4075c419d86',
    key: 'exp_opex_other',
    label: 'Other Administrative Expenses',
    account_element_id: accountElementIds.opex,
    description:
      'Miscellaneous expenses related to the general running of the business',
    report_code: 'IS.EXP.OPX.OTH',
    label_role: 'fallback',
    trainable: false,
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['cl_accrued_opex', 'cl_accrued_misc'],
  },

  {
    id: '3a2a0a25-cd2c-4b9b-baf2-b3a46d78c2be',
    key: 'exp_nopex_finance_costs',
    label: 'Finance Costs',
    account_element_id: accountElementIds.nonOpex,
    description:
      'Costs incurred from borrowing funds, including interest and other charges',
    report_code: 'IS.EXP.NOP.FIN',
    label_role: 'semantic',
    trainable: false, // interest accruals don't come from bank text; handle via schedules
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['cl_accrued_finance_cost'],
  },
  {
    id: 'cfcd5b51-348b-4b92-8045-dc6485bca69e',
    key: 'exp_nopex_other',
    label: 'Other Non-Operating Expenses',
    account_element_id: accountElementIds.nonOpex,
    description: 'Expenses not related to core business operations',
    report_code: 'IS.EXP.NOP.OTH',
    label_role: 'fallback',
    trainable: false, // too heterogeneous
    is_contra: false,
    is_postable_control: false,
    accrual_targets: ['cl_accrued_misc'],
  },
  {
    id: '26d7dc5c-e1f7-4159-8786-dac74a0f20d1',
    key: 'exp_nopex_tax',
    label: 'Tax Expense',
    account_element_id: accountElementIds.nonOpex,
    description: 'Income taxes payable by the company on its earnings',
    report_code: 'IS.EXP.NOP.TAX',
    label_role: 'mechanical', // provisioned/closed, not bank-classified
    trainable: false,
    is_contra: false,
    is_postable_control: false,
    // mechanical, (provisions not bank-posted)
  },
];

export const defaultAccountTypes: AccountTypeWithRequiredReportCode[] = [
  ...defaultNonCurrentAssetTypes,
  ...defaultCurrentAssetTypes,
  ...defaultNonCurrentLiabilityTypes,
  ...defaultCurrentLiabilityTypes,
  ...defaultEquityTypes,
  ...defaultIncomeTypes,
  ...defaultExpenseTypes,
];

/**
 * Array of all account type keys for type-safe usage in schemas
 * Extracted from defaultAccountTypes at compile time
 */
export const accountTypeKeys = defaultAccountTypes.map((type) => type.key) as [
  string,
  ...string[],
];

/**
 * Union type of all account type keys
 */
export type AccountTypeKey = (typeof accountTypeKeys)[number];
