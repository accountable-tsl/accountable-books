from pydantic import BaseModel, constr

class AssignCoaPayload(BaseModel):
    entryId: constr(min_length=1)
    coaId: constr(min_length=1)