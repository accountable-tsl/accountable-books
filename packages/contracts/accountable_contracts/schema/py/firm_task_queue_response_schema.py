from pydantic import BaseModel, conint
from typing import Any, List, Optional
from enum import Enum
from uuid import UUID

class ActionableItemsItemTaskTypeEnum(str, Enum):
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

class ActionableItemsItemTaskCategoryEnum(str, Enum):
    CATEGORIZATION = "categorization"
    JOURNALS = "journals"
    REVIEW = "review"
    CLIENT_ACTION = "client_action"

class ActionableItemsItemScopeTypeEnum(str, Enum):
    COMPANY = "company"
    COMPANY_PERIOD = "company_period"
    BANK_ACCOUNT = "bank_account"

class ActionableItemsItemStatusEnum(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"

class ActionableItemsItemPriorityEnum(str, Enum):
    URGENT = "urgent"
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"

class ActionableItemsItemActionabilityStateEnum(str, Enum):
    ACTIONABLE_NOW = "actionable_now"
    BLOCKED_BY_CLIENT = "blocked_by_client"
    BLOCKED_BY_DEPENDENCY = "blocked_by_dependency"
    INFORMATIONAL = "informational"

class FirmTaskQueueResponseSchema(BaseModel):
    class Summary(BaseModel):
        totalTasks: conint(ge=0)
        actionableCount: conint(ge=0)
        waitingCount: conint(ge=0)
        clientCompanyCount: conint(ge=0)
        criticalCount: conint(ge=0)
        dueTodayCount: conint(ge=0)
    class ActionableItemsItem(BaseModel):
        class ActionableItemsItemAssignedTo(BaseModel):
            userId: UUID
            name: str
            initials: str
        id: UUID
        firmCompanyId: UUID
        taskType: ActionableItemsItemTaskTypeEnum
        taskCategory: ActionableItemsItemTaskCategoryEnum
        scopeType: ActionableItemsItemScopeTypeEnum
        title: str
        description: Optional[str]
        status: ActionableItemsItemStatusEnum
        priority: ActionableItemsItemPriorityEnum
        dueDate: Optional[str]
        isOverdue: bool
        isBlocked: bool
        actionabilityState: ActionableItemsItemActionabilityStateEnum
        hasWarnings: bool
        primaryBlockerLabel: Optional[str]
        clientCompanyId: UUID
        clientDisplayName: str
        periodLabel: Optional[str]
        workflowRunId: Optional[UUID]
        assignedTo: Optional[ActionableItemsItemAssignedTo]
        deepLink: str
        metrics: Any
    class WaitingItemsItem(BaseModel):
        class WaitingItemsItemAssignedTo(BaseModel):
            userId: UUID
            name: str
            initials: str
        id: UUID
        firmCompanyId: UUID
        taskType: ActionableItemsItemTaskTypeEnum
        taskCategory: ActionableItemsItemTaskCategoryEnum
        scopeType: ActionableItemsItemScopeTypeEnum
        title: str
        description: Optional[str]
        status: ActionableItemsItemStatusEnum
        priority: ActionableItemsItemPriorityEnum
        dueDate: Optional[str]
        isOverdue: bool
        isBlocked: bool
        actionabilityState: ActionableItemsItemActionabilityStateEnum
        hasWarnings: bool
        primaryBlockerLabel: Optional[str]
        clientCompanyId: UUID
        clientDisplayName: str
        periodLabel: Optional[str]
        workflowRunId: Optional[UUID]
        assignedTo: Optional[WaitingItemsItemAssignedTo]
        deepLink: str
        metrics: Any
    firmCompanyId: UUID
    summary: Summary
    actionableItems: List[ActionableItemsItem]
    waitingItems: List[WaitingItemsItem]