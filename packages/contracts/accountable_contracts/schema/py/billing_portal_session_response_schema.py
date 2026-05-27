from pydantic import BaseModel

class BillingPortalSessionResponseSchema(BaseModel):
    portalUrl: str