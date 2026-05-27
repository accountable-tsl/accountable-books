from enum import Enum

class FirmEngagementTaskScopeTypeSchema(str, Enum):
    COMPANY = "company"
    COMPANY_PERIOD = "company_period"
    BANK_ACCOUNT = "bank_account"