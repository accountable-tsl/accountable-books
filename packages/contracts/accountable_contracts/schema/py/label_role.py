from enum import Enum

class LabelRole(str, Enum):
    SEMANTIC = "semantic"
    MECHANICAL = "mechanical"
    CONTROL = "control"
    FALLBACK = "fallback"