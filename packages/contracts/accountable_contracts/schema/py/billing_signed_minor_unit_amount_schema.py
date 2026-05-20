from pydantic import BaseModel, constr

PATTERN_REGEX = r"^-?\d+$"

type BillingSignedMinorUnitAmountSchema = constr(pattern=PATTERN_REGEX)