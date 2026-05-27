from pydantic import BaseModel, constr

PATTERN_REGEX = r"^\d+$"

type BillingMinorUnitAmountSchema = constr(pattern=PATTERN_REGEX)