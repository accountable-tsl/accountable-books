from enum import Enum

class CategorizationTaskSource(str, Enum):
    INGESTION = "ingestion"
    BACKFILL = "backfill"
    MANUAL = "manual"