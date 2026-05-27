from pydantic import BaseModel, constr

type BillingPlanKeySchema = constr(min_length=1, max_length=120)