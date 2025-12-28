from enum import Enum

class ObjStorageProvider(str, Enum):
    CLOUDFLARE_R2 = "cloudflare_r2"