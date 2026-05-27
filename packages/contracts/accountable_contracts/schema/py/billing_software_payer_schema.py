from enum import Enum

class BillingSoftwarePayerSchema(str, Enum):
    FIRM = "firm"
    CLIENT = "client"