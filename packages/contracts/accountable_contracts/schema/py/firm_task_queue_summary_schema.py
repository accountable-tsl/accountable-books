from pydantic import BaseModel, conint

class FirmTaskQueueSummarySchema(BaseModel):
    totalTasks: conint(ge=0)
    actionableCount: conint(ge=0)
    waitingCount: conint(ge=0)
    clientCompanyCount: conint(ge=0)
    criticalCount: conint(ge=0)
    dueTodayCount: conint(ge=0)