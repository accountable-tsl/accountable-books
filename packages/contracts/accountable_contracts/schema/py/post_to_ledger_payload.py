from pydantic import BaseModel, constr

class PostToLedgerPayload(BaseModel):
    bankTransactionId: constr(min_length=1)