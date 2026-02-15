from pydantic import BaseModel, constr
from typing import Literal

class AiEffectUiNavigate(BaseModel):
    type: Literal["ui.navigate"]
    to: constr(min_length=1)