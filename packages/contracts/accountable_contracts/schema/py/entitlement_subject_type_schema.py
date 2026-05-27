from enum import Enum

class EntitlementSubjectTypeSchema(str, Enum):
    FIRM = "firm"
    BUSINESS = "business"
    INDIVIDUAL = "individual"
    WORKSPACE = "workspace"