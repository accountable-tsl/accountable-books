from enum import Enum

class BillingPlanFeatureCodeSchema(str, Enum):
    INTERNAL_WORKSPACE_LIMIT = "internal_workspace_limit"
    EMPLOYEE_SEAT_LIMIT = "employee_seat_limit"
    MONTHLY_CREDIT_ALLOWANCE_UNITS = "monthly_credit_allowance_units"
    MANAGED_WORKSPACE_MONTHLY_CREDIT_BONUS = "managed_workspace_monthly_credit_bonus"
    MANAGED_CLIENT_PRICING_TIER = "managed_client_pricing_tier"
    BRANDING_TIER = "branding_tier"
    SUPPORT_TIER = "support_tier"
    ONBOARDING_SUPPORT = "onboarding_support"
    CURRENCY_MODE = "currency_mode"
    CONNECTED_BANK_ACCOUNTS_LIMIT = "connected_bank_accounts_limit"
    LAUNCH_SCOPE = "launch_scope"