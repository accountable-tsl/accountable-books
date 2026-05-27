from pydantic import BaseModel
from typing import Any, Optional
from enum import Enum
from uuid import UUID

class TaskTypeEnum(str, Enum):
    CATEGORIZE_TRANSACTIONS = "categorize_transactions"
    REVIEW_AI_CATEGORIZATIONS = "review_ai_categorizations"
    REVIEW_DRAFT_JOURNALS = "review_draft_journals"
    PREPARE_PERIOD_FOR_REVIEW = "prepare_period_for_review"
    REQUEST_REVIEW = "request_review"
    APPROVE_PERIOD = "approve_period"
    SEND_REPORTS = "send_reports"
    CLOSE_PERIOD = "close_period"
    RECONNECT_BANK = "reconnect_bank"
    RESPOND_TO_QUERIES = "respond_to_queries"

class TaskCategoryEnum(str, Enum):
    CATEGORIZATION = "categorization"
    JOURNALS = "journals"
    REVIEW = "review"
    CLIENT_ACTION = "client_action"

class ScopeTypeEnum(str, Enum):
    COMPANY = "company"
    COMPANY_PERIOD = "company_period"
    BANK_ACCOUNT = "bank_account"

class StatusEnum(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"

class PriorityEnum(str, Enum):
    URGENT = "urgent"
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"

class ActionabilityStateEnum(str, Enum):
    ACTIONABLE_NOW = "actionable_now"
    BLOCKED_BY_CLIENT = "blocked_by_client"
    BLOCKED_BY_DEPENDENCY = "blocked_by_dependency"
    INFORMATIONAL = "informational"

class FirmTaskQueueItemSchema(BaseModel):
    class AssignedTo(BaseModel):
        userId: UUID
        name: str
        initials: str
    id: UUID
    firmCompanyId: UUID
    taskType: TaskTypeEnum
    taskCategory: TaskCategoryEnum
    scopeType: ScopeTypeEnum
    title: str
    description: Optional[str]
    status: StatusEnum
    priority: PriorityEnum
    dueDate: Optional[str]
    isOverdue: bool
    isBlocked: bool
    actionabilityState: ActionabilityStateEnum
    hasWarnings: bool
    primaryBlockerLabel: Optional[str]
    clientCompanyId: UUID
    clientDisplayName: str
    periodLabel: Optional[str]
    workflowRunId: Optional[UUID]
    assignedTo: Optional[AssignedTo]
    deepLink: str
    metrics: Any