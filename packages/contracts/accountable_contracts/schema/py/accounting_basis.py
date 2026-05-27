from enum import Enum

class AccountingBasis(str, Enum):
    MODIFIED_CASH_BASIS = "modified_cash_basis"
    MODIFIED_ACCRUAL_BASIS = "modified_accrual_basis"