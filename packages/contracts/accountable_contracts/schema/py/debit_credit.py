from enum import Enum

class DebitCredit(str, Enum):
    DEBIT = "debit"
    CREDIT = "credit"