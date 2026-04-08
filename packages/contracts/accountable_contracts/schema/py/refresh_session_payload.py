from pydantic import BaseModel

class RefreshSessionPayload(BaseModel):
    csrfToken: str