from pydantic import BaseModel, conint
from typing import Literal, Union
from enum import Enum

class Option4FeatureValueTierEnum(str, Enum):
    STANDARD = "standard"
    DISCOUNTED = "discounted"
    LOWEST = "lowest"

class Option5FeatureValueTierEnum(str, Enum):
    SUBDOMAIN_ONLY = "subdomain_only"
    BASIC_BRANDING = "basic_branding"
    CUSTOM = "custom"

class Option6FeatureValueTierEnum(str, Enum):
    STANDARD = "standard"
    ENHANCED = "enhanced"
    PRIORITY = "priority"
    CUSTOM = "custom"

class Option8FeatureValueModeEnum(str, Enum):
    SINGLE_CURRENCY = "single_currency"
    MULTICURRENCY = "multicurrency"

class Option0(BaseModel):
    class Option0FeatureValue(BaseModel):
        count: conint(ge=0)
    featureCode: Literal["internal_workspace_limit"]
    featureValue: Option0FeatureValue

class Option1(BaseModel):
    class Option1FeatureValue(BaseModel):
        unlimited: bool
    featureCode: Literal["employee_seat_limit"]
    featureValue: Option1FeatureValue

class Option2(BaseModel):
    class Option2FeatureValueOption0(BaseModel):
        units: conint(ge=0)
    class Option2FeatureValueOption1(BaseModel):
        mode: Literal["negotiated"]
    featureCode: Literal["monthly_credit_allowance_units"]
    featureValue: Union[Option2FeatureValueOption0, Option2FeatureValueOption1]

class Option3(BaseModel):
    class Option3FeatureValueOption0(BaseModel):
        business_basic: conint(ge=0)
        business_standard: conint(ge=0)
        business_premium: conint(ge=0)
    class Option3FeatureValueOption1(BaseModel):
        mode: Literal["negotiated"]
    featureCode: Literal["managed_workspace_monthly_credit_bonus"]
    featureValue: Union[Option3FeatureValueOption0, Option3FeatureValueOption1]

class Option4(BaseModel):
    class Option4FeatureValue(BaseModel):
        tier: Option4FeatureValueTierEnum
    featureCode: Literal["managed_client_pricing_tier"]
    featureValue: Option4FeatureValue

class Option5(BaseModel):
    class Option5FeatureValue(BaseModel):
        tier: Option5FeatureValueTierEnum
    featureCode: Literal["branding_tier"]
    featureValue: Option5FeatureValue

class Option6(BaseModel):
    class Option6FeatureValue(BaseModel):
        tier: Option6FeatureValueTierEnum
    featureCode: Literal["support_tier"]
    featureValue: Option6FeatureValue

class Option7(BaseModel):
    class Option7FeatureValue(BaseModel):
        included: bool
    featureCode: Literal["onboarding_support"]
    featureValue: Option7FeatureValue

class Option8(BaseModel):
    class Option8FeatureValue(BaseModel):
        mode: Option8FeatureValueModeEnum
    featureCode: Literal["currency_mode"]
    featureValue: Option8FeatureValue

class Option9(BaseModel):
    class Option9FeatureValueOption0(BaseModel):
        count: conint(ge=0)
    class Option9FeatureValueOption1(BaseModel):
        unlimited: Literal[True]
    featureCode: Literal["connected_bank_accounts_limit"]
    featureValue: Union[Option9FeatureValueOption0, Option9FeatureValueOption1]

class Option10(BaseModel):
    class Option10FeatureValue(BaseModel):
        mode: Literal["limited"]
    featureCode: Literal["launch_scope"]
    featureValue: Option10FeatureValue

type BillingCatalogFeatureSummarySchema = Union[Option0, Option1, Option2, Option3, Option4, Option5, Option6, Option7, Option8, Option9, Option10]