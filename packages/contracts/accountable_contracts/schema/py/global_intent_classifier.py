from pydantic import BaseModel, confloat
from typing import Any, List, Literal
from enum import Enum

class SemanticTopKItemKeyEnum(str, Enum):
    NCA_LAND = "nca_land"
    NCA_PPE = "nca_ppe"
    NCA_PPE_CONTRA = "nca_ppe_contra"
    NCA_INVESTMENT_PROPERTY = "nca_investment_property"
    NCA_INVESTMENT_PROPERTY_CONTRA = "nca_investment_property_contra"
    NCA_ROU_ASSET = "nca_rou_asset"
    NCA_ROU_ASSET_CONTRA = "nca_rou_asset_contra"
    NCA_INTANGIBLE_ASSET = "nca_intangible_asset"
    NCA_INTANGIBLE_ASSET_CONTRA = "nca_intangible_asset_contra"
    NCA_OTHER = "nca_other"
    CA_BANK = "ca_bank"
    CA_CASH_EQUIVALENT = "ca_cash_equivalent"
    CA_INVENTORY = "ca_inventory"
    CA_INVENTORY_CONTRA = "ca_inventory_contra"
    CA_TRADE_RECEIVABLE = "ca_trade_receivable"
    CA_TRADE_RECEIVABLE_CONTRA = "ca_trade_receivable_contra"
    CA_CONTRACT_ASSET = "ca_contract_asset"
    CA_PREPAYMENT = "ca_prepayment"
    CA_DUE_FROM_RELATED_PARTY = "ca_due_from_related_party"
    CA_OTHER_RECEIVABLE = "ca_other_receivable"
    CA_OTHER = "ca_other"
    NCL_LONG_TERM_DEBT = "ncl_long_term_debt"
    NCL_LONG_TERM_DEBT_CONTRA = "ncl_long_term_debt_contra"
    NCL_LONG_TERM_LEASE = "ncl_long_term_lease"
    NCL_OTHER = "ncl_other"
    CL_TRADE_PAYABLE = "cl_trade_payable"
    CL_PAYROLL_PAYABLES = "cl_payroll_payables"
    CL_ACCRUED_PROFESSIONAL_FEES = "cl_accrued_professional_fees"
    CL_ACCRUED_FINANCE_COST = "cl_accrued_finance_cost"
    CL_ACCRUED_OPEX = "cl_accrued_opex"
    CL_ACCRUED_MISC = "cl_accrued_misc"
    CL_OTHER_PAYABLES = "cl_other_payables"
    CL_CONTRACT_LIABILITIES = "cl_contract_liabilities"
    CL_DUE_TO_RELATED_PARTIES = "cl_due_to_related_parties"
    CL_SHORT_TERM_DEBT = "cl_short_term_debt"
    CL_SHORT_TERM_DEBT_CONTRA = "cl_short_term_debt_contra"
    CL_TAX = "cl_tax"
    CL_CURRENT_DEBT_PORTION = "cl_current_debt_portion"
    CL_OTHER = "cl_other"
    EQ_CONTRIBUTED_CAPITAL = "eq_contributed_capital"
    EQ_RETAINED_EARNINGS = "eq_retained_earnings"
    EQ_OCI = "eq_oci"
    EQ_OTHER = "eq_other"
    REV_REVENUE = "rev_revenue"
    REV_CONTRA = "rev_contra"
    REV_FINANCE_INCOME = "rev_finance_income"
    REV_OTHER_INCOME = "rev_other_income"
    EXP_COS = "exp_cos"
    EXP_OPEX_EMPLOYEE_BENEFITS = "exp_opex_employee_benefits"
    EXP_OPEX_MARKETING_SELLING = "exp_opex_marketing_selling"
    EXP_OPEX_RENT = "exp_opex_rent"
    EXP_OPEX_INSURANCE = "exp_opex_insurance"
    EXP_OPEX_UTILITIES = "exp_opex_utilities"
    EXP_OPEX_REPAIRS = "exp_opex_repairs"
    EXP_OPEX_PROFESSIONAL_FEES = "exp_opex_professional_fees"
    EXP_OPEX_TEL_INTERNET = "exp_opex_tel_internet"
    EXP_OPEX_SOFTWARE_SUBSCRIPTIONS = "exp_opex_software_subscriptions"
    EXP_OPEX_TRAVEL = "exp_opex_travel"
    EXP_OPEX_BANK_FEES = "exp_opex_bank_fees"
    EXP_OPEX_RND = "exp_opex_rnd"
    EXP_OPEX_DEPRECIATION_AMORTIZATION = "exp_opex_depreciation_amortization"
    EXP_OPEX_MEMBERSHIPS = "exp_opex_memberships"
    EXP_OPEX_OFFICE_SUPPLIES = "exp_opex_office_supplies"
    EXP_NOPEX_DONATIONS = "exp_nopex_donations"
    EXP_OPEX_OTHER = "exp_opex_other"
    EXP_NOPEX_FINANCE_COSTS = "exp_nopex_finance_costs"
    EXP_NOPEX_OTHER = "exp_nopex_other"
    EXP_NOPEX_TAX = "exp_nopex_tax"

class SemanticTopKItemLabelRoleEnum(str, Enum):
    SEMANTIC = "semantic"
    MECHANICAL = "mechanical"
    CONTROL = "control"
    FALLBACK = "fallback"

class GlobalIntentClassifier(BaseModel):
    class SemanticTopKItem(BaseModel):
        key: SemanticTopKItemKeyEnum
        prob: float
        label_role: SemanticTopKItemLabelRoleEnum
    model_name: Literal["global_intent_classifier"]
    model_version: Any
    latency_ms: float
    semantic_top1: str
    semantic_top1_prob: confloat(ge=0, le=1)
    semantic_top_k: List[SemanticTopKItem]
    shap_values: Any
    feature_mapping_version: str