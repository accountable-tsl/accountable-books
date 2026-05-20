from pydantic import BaseModel, conint, constr
from typing import List, Literal, Optional, Union
from enum import Enum

UNIT_AMOUNT_MINOR_REGEX = r"^\d+$"

class PricesItemBillingIntervalEnum(str, Enum):
    MONTH = "month"
    YEAR = "year"

class FeaturesItemOption4FeatureValueTierEnum(str, Enum):
    STANDARD = "standard"
    DISCOUNTED = "discounted"
    LOWEST = "lowest"

class FeaturesItemOption5FeatureValueTierEnum(str, Enum):
    SUBDOMAIN_ONLY = "subdomain_only"
    BASIC_BRANDING = "basic_branding"
    CUSTOM = "custom"

class FeaturesItemOption6FeatureValueTierEnum(str, Enum):
    STANDARD = "standard"
    ENHANCED = "enhanced"
    PRIORITY = "priority"
    CUSTOM = "custom"

class FeaturesItemOption8FeatureValueModeEnum(str, Enum):
    SINGLE_CURRENCY = "single_currency"
    MULTICURRENCY = "multicurrency"

class PlanFamilyEnum(str, Enum):
    FIRM = "firm"
    BUSINESS = "business"
    INDIVIDUAL = "individual"

class PlanKindEnum(str, Enum):
    FREE = "free"
    PAID = "paid"
    CUSTOM_CONTACT = "custom_contact"

class BillingCatalogPlanSchema(BaseModel):
    class PricesItem(BaseModel):
        currencyCode: constr(min_length=3, max_length=3)
        billingInterval: PricesItemBillingIntervalEnum
        unitAmountMinor: constr(pattern=UNIT_AMOUNT_MINOR_REGEX)
    class FeaturesItemOption0(BaseModel):
        class FeaturesItemOption0FeatureValue(BaseModel):
            count: conint(ge=0)
        featureCode: Literal["internal_workspace_limit"]
        featureValue: FeaturesItemOption0FeatureValue
    class FeaturesItemOption1(BaseModel):
        class FeaturesItemOption1FeatureValue(BaseModel):
            unlimited: bool
        featureCode: Literal["employee_seat_limit"]
        featureValue: FeaturesItemOption1FeatureValue
    class FeaturesItemOption2(BaseModel):
        class FeaturesItemOption2FeatureValueOption0(BaseModel):
            units: conint(ge=0)
        class FeaturesItemOption2FeatureValueOption1(BaseModel):
            mode: Literal["negotiated"]
        featureCode: Literal["monthly_credit_allowance_units"]
        featureValue: Union[FeaturesItemOption2FeatureValueOption0, FeaturesItemOption2FeatureValueOption1]
    class FeaturesItemOption3(BaseModel):
        class FeaturesItemOption3FeatureValueOption0(BaseModel):
            business_basic: conint(ge=0)
            business_standard: conint(ge=0)
            business_premium: conint(ge=0)
        class FeaturesItemOption3FeatureValueOption1(BaseModel):
            mode: Literal["negotiated"]
        featureCode: Literal["managed_workspace_monthly_credit_bonus"]
        featureValue: Union[FeaturesItemOption3FeatureValueOption0, FeaturesItemOption3FeatureValueOption1]
    class FeaturesItemOption4(BaseModel):
        class FeaturesItemOption4FeatureValue(BaseModel):
            tier: FeaturesItemOption4FeatureValueTierEnum
        featureCode: Literal["managed_client_pricing_tier"]
        featureValue: FeaturesItemOption4FeatureValue
    class FeaturesItemOption5(BaseModel):
        class FeaturesItemOption5FeatureValue(BaseModel):
            tier: FeaturesItemOption5FeatureValueTierEnum
        featureCode: Literal["branding_tier"]
        featureValue: FeaturesItemOption5FeatureValue
    class FeaturesItemOption6(BaseModel):
        class FeaturesItemOption6FeatureValue(BaseModel):
            tier: FeaturesItemOption6FeatureValueTierEnum
        featureCode: Literal["support_tier"]
        featureValue: FeaturesItemOption6FeatureValue
    class FeaturesItemOption7(BaseModel):
        class FeaturesItemOption7FeatureValue(BaseModel):
            included: bool
        featureCode: Literal["onboarding_support"]
        featureValue: FeaturesItemOption7FeatureValue
    class FeaturesItemOption8(BaseModel):
        class FeaturesItemOption8FeatureValue(BaseModel):
            mode: FeaturesItemOption8FeatureValueModeEnum
        featureCode: Literal["currency_mode"]
        featureValue: FeaturesItemOption8FeatureValue
    class FeaturesItemOption9(BaseModel):
        class FeaturesItemOption9FeatureValueOption0(BaseModel):
            count: conint(ge=0)
        class FeaturesItemOption9FeatureValueOption1(BaseModel):
            unlimited: Literal[True]
        featureCode: Literal["connected_bank_accounts_limit"]
        featureValue: Union[FeaturesItemOption9FeatureValueOption0, FeaturesItemOption9FeatureValueOption1]
    class FeaturesItemOption10(BaseModel):
        class FeaturesItemOption10FeatureValue(BaseModel):
            mode: Literal["limited"]
        featureCode: Literal["launch_scope"]
        featureValue: FeaturesItemOption10FeatureValue
    planKey: constr(min_length=1, max_length=120)
    planFamily: PlanFamilyEnum
    planKind: PlanKindEnum
    displayName: constr(min_length=1, max_length=160)
    publicLabel: Optional[str]
    isActive: bool
    prices: List[PricesItem]
    features: List[Union[FeaturesItemOption0, FeaturesItemOption1, FeaturesItemOption2, FeaturesItemOption3, FeaturesItemOption4, FeaturesItemOption5, FeaturesItemOption6, FeaturesItemOption7, FeaturesItemOption8, FeaturesItemOption9, FeaturesItemOption10]]