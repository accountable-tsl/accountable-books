from enum import Enum

class AiMessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"