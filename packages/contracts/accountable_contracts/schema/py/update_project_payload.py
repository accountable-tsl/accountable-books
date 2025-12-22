from pydantic import BaseModel, constr
from typing import Optional

class UpdateProjectPayload(BaseModel):
    entryId: constr(min_length=1)
    projectId: Optional[str]
    projectName: Optional[str]