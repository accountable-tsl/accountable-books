from pydantic import BaseModel
from typing import List, Optional
from datetime import date

class GetCategorizationStatsParams(BaseModel):
    companyId: str
    bankAccountIds: Optional[List[str]] = None
    dateFrom: Optional[date] = None
    dateTo: Optional[date] = None