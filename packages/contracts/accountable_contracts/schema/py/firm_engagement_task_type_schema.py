from enum import Enum

class FirmEngagementTaskTypeSchema(str, Enum):
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