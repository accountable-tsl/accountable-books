from pydantic import BaseModel, constr
from typing import Any, Literal

class AiEffectProposalForm(BaseModel):
    type: Literal["proposal.form"]
    proposalId: constr(min_length=1)
    formType: constr(min_length=1)
    data: Any