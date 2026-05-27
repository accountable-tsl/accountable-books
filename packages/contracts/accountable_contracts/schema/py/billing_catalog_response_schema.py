from pydantic import BaseModel, conint, constr
from typing import List, Literal, Optional, Union
from enum import Enum
from datetime import datetime

UNIT_AMOUNT_MINOR_REGEX = r"^\d+$"

class PlansItemPricesItemBillingIntervalEnum(str, Enum):
    MONTH = "month"
    YEAR = "year"

class PlansItemFeaturesItemOption4FeatureValueTierEnum(str, Enum):
    STANDARD = "standard"
    DISCOUNTED = "discounted"
    LOWEST = "lowest"

class PlansItemFeaturesItemOption5FeatureValueTierEnum(str, Enum):
    SUBDOMAIN_ONLY = "subdomain_only"
    BASIC_BRANDING = "basic_branding"
    CUSTOM = "custom"

class PlansItemFeaturesItemOption6FeatureValueTierEnum(str, Enum):
    STANDARD = "standard"
    ENHANCED = "enhanced"
    PRIORITY = "priority"
    CUSTOM = "custom"

class PlansItemFeaturesItemOption8FeatureValueModeEnum(str, Enum):
    SINGLE_CURRENCY = "single_currency"
    MULTICURRENCY = "multicurrency"

class PlansItemPlanFamilyEnum(str, Enum):
    FIRM = "firm"
    BUSINESS = "business"
    INDIVIDUAL = "individual"

class PlansItemPlanKindEnum(str, Enum):
    FREE = "free"
    PAID = "paid"
    CUSTOM_CONTACT = "custom_contact"

class BillingCatalogResponseSchema(BaseModel):
    class PlansItem(BaseModel):
        class PlansItemPricesItem(BaseModel):
            currencyCode: constr(min_length=3, max_length=3)
            billingInterval: PlansItemPricesItemBillingIntervalEnum
            unitAmountMinor: constr(pattern=UNIT_AMOUNT_MINOR_REGEX)
        class PlansItemFeaturesItemOption0(BaseModel):
            class PlansItemFeaturesItemOption0FeatureValue(BaseModel):
                count: conint(ge=0)
            featureCode: Literal["internal_workspace_limit"]
            featureValue: PlansItemFeaturesItemOption0FeatureValue
        class PlansItemFeaturesItemOption1(BaseModel):
            class PlansItemFeaturesItemOption1FeatureValue(BaseModel):
                unlimited: bool
            featureCode: Literal["employee_seat_limit"]
            featureValue: PlansItemFeaturesItemOption1FeatureValue
        class PlansItemFeaturesItemOption2(BaseModel):
            class PlansItemFeaturesItemOption2FeatureValueOption0(BaseModel):
                units: conint(ge=0)
            class PlansItemFeaturesItemOption2FeatureValueOption1(BaseModel):
                mode: Literal["negotiated"]
            featureCode: Literal["monthly_credit_allowance_units"]
            featureValue: Union[PlansItemFeaturesItemOption2FeatureValueOption0, PlansItemFeaturesItemOption2FeatureValueOption1]
        class PlansItemFeaturesItemOption3(BaseModel):
            class PlansItemFeaturesItemOption3FeatureValueOption0(BaseModel):
                business_basic: conint(ge=0)
                business_standard: conint(ge=0)
                business_premium: conint(ge=0)
            class PlansItemFeaturesItemOption3FeatureValueOption1(BaseModel):
                mode: Literal["negotiated"]
            featureCode: Literal["managed_workspace_monthly_credit_bonus"]
            featureValue: Union[PlansItemFeaturesItemOption3FeatureValueOption0, PlansItemFeaturesItemOption3FeatureValueOption1]
        class PlansItemFeaturesItemOption4(BaseModel):
            class PlansItemFeaturesItemOption4FeatureValue(BaseModel):
                tier: PlansItemFeaturesItemOption4FeatureValueTierEnum
            featureCode: Literal["managed_client_pricing_tier"]
            featureValue: PlansItemFeaturesItemOption4FeatureValue
        class PlansItemFeaturesItemOption5(BaseModel):
            class PlansItemFeaturesItemOption5FeatureValue(BaseModel):
                tier: PlansItemFeaturesItemOption5FeatureValueTierEnum
            featureCode: Literal["branding_tier"]
            featureValue: PlansItemFeaturesItemOption5FeatureValue
        class PlansItemFeaturesItemOption6(BaseModel):
            class PlansItemFeaturesItemOption6FeatureValue(BaseModel):
                tier: PlansItemFeaturesItemOption6FeatureValueTierEnum
            featureCode: Literal["support_tier"]
            featureValue: PlansItemFeaturesItemOption6FeatureValue
        class PlansItemFeaturesItemOption7(BaseModel):
            class PlansItemFeaturesItemOption7FeatureValue(BaseModel):
                included: bool
            featureCode: Literal["onboarding_support"]
            featureValue: PlansItemFeaturesItemOption7FeatureValue
        class PlansItemFeaturesItemOption8(BaseModel):
            class PlansItemFeaturesItemOption8FeatureValue(BaseModel):
                mode: PlansItemFeaturesItemOption8FeatureValueModeEnum
            featureCode: Literal["currency_mode"]
            featureValue: PlansItemFeaturesItemOption8FeatureValue
        class PlansItemFeaturesItemOption9(BaseModel):
            class PlansItemFeaturesItemOption9FeatureValueOption0(BaseModel):
                count: conint(ge=0)
            class PlansItemFeaturesItemOption9FeatureValueOption1(BaseModel):
                unlimited: Literal[True]
            featureCode: Literal["connected_bank_accounts_limit"]
            featureValue: Union[PlansItemFeaturesItemOption9FeatureValueOption0, PlansItemFeaturesItemOption9FeatureValueOption1]
        class PlansItemFeaturesItemOption10(BaseModel):
            class PlansItemFeaturesItemOption10FeatureValue(BaseModel):
                mode: Literal["limited"]
            featureCode: Literal["launch_scope"]
            featureValue: PlansItemFeaturesItemOption10FeatureValue
        planKey: constr(min_length=1, max_length=120)
        planFamily: PlansItemPlanFamilyEnum
        planKind: PlansItemPlanKindEnum
        displayName: constr(min_length=1, max_length=160)
        publicLabel: Optional[str]
        isActive: bool
        prices: List[PlansItemPricesItem]
        features: List[Union[PlansItemFeaturesItemOption0, PlansItemFeaturesItemOption1, PlansItemFeaturesItemOption2, PlansItemFeaturesItemOption3, PlansItemFeaturesItemOption4, PlansItemFeaturesItemOption5, PlansItemFeaturesItemOption6, PlansItemFeaturesItemOption7, PlansItemFeaturesItemOption8, PlansItemFeaturesItemOption9, PlansItemFeaturesItemOption10]]
    asOf: datetime
    currencyCode: constr(min_length=3, max_length=3)
    plans: List[PlansItem]