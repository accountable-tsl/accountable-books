"""JSON data files with helper functions."""

from importlib.resources import files
import json
from typing import Any

# Cache variables
_account_element_ids_cache: list[dict[str, Any]] | dict[str, Any] | None = None
_account_type_keys_cache: list[dict[str, Any]] | dict[str, Any] | None = None
_default_account_types_cache: list[dict[str, Any]] | dict[str, Any] | None = None
_default_current_asset_types_cache: list[dict[str, Any]] | dict[str, Any] | None = None
_default_current_liability_types_cache: list[dict[str, Any]] | dict[str, Any] | None = None
_default_equity_types_cache: list[dict[str, Any]] | dict[str, Any] | None = None
_default_expense_types_cache: list[dict[str, Any]] | dict[str, Any] | None = None
_default_income_types_cache: list[dict[str, Any]] | dict[str, Any] | None = None
_default_non_current_asset_types_cache: list[dict[str, Any]] | dict[str, Any] | None = None
_default_non_current_liability_types_cache: list[dict[str, Any]] | dict[str, Any] | None = None
_financial_statement_ids_cache: list[dict[str, Any]] | dict[str, Any] | None = None
_latest_enriched_transaction_cache: list[dict[str, Any]] | dict[str, Any] | None = None

# Getter functions (always return fresh data)

def get_account_element_ids() -> list[dict[str, Any]] | dict[str, Any]:
    """Load account_element_ids.json data."""
    from importlib.resources import files
    import json
    json_file = files("accountable_contracts.data.generated.json") / "account/account_element_ids.json"
    return json.loads(json_file.read_text(encoding="utf-8"))

def get_account_type_keys() -> list[dict[str, Any]] | dict[str, Any]:
    """Load account_type_keys.json data."""
    from importlib.resources import files
    import json
    json_file = files("accountable_contracts.data.generated.json") / "account/account_type_keys.json"
    return json.loads(json_file.read_text(encoding="utf-8"))

def get_default_account_types() -> list[dict[str, Any]] | dict[str, Any]:
    """Load default_account_types.json data."""
    from importlib.resources import files
    import json
    json_file = files("accountable_contracts.data.generated.json") / "account/default_account_types.json"
    return json.loads(json_file.read_text(encoding="utf-8"))

def get_default_current_asset_types() -> list[dict[str, Any]] | dict[str, Any]:
    """Load default_current_asset_types.json data."""
    from importlib.resources import files
    import json
    json_file = files("accountable_contracts.data.generated.json") / "account/default_current_asset_types.json"
    return json.loads(json_file.read_text(encoding="utf-8"))

def get_default_current_liability_types() -> list[dict[str, Any]] | dict[str, Any]:
    """Load default_current_liability_types.json data."""
    from importlib.resources import files
    import json
    json_file = files("accountable_contracts.data.generated.json") / "account/default_current_liability_types.json"
    return json.loads(json_file.read_text(encoding="utf-8"))

def get_default_equity_types() -> list[dict[str, Any]] | dict[str, Any]:
    """Load default_equity_types.json data."""
    from importlib.resources import files
    import json
    json_file = files("accountable_contracts.data.generated.json") / "account/default_equity_types.json"
    return json.loads(json_file.read_text(encoding="utf-8"))

def get_default_expense_types() -> list[dict[str, Any]] | dict[str, Any]:
    """Load default_expense_types.json data."""
    from importlib.resources import files
    import json
    json_file = files("accountable_contracts.data.generated.json") / "account/default_expense_types.json"
    return json.loads(json_file.read_text(encoding="utf-8"))

def get_default_income_types() -> list[dict[str, Any]] | dict[str, Any]:
    """Load default_income_types.json data."""
    from importlib.resources import files
    import json
    json_file = files("accountable_contracts.data.generated.json") / "account/default_income_types.json"
    return json.loads(json_file.read_text(encoding="utf-8"))

def get_default_non_current_asset_types() -> list[dict[str, Any]] | dict[str, Any]:
    """Load default_non_current_asset_types.json data."""
    from importlib.resources import files
    import json
    json_file = files("accountable_contracts.data.generated.json") / "account/default_non_current_asset_types.json"
    return json.loads(json_file.read_text(encoding="utf-8"))

def get_default_non_current_liability_types() -> list[dict[str, Any]] | dict[str, Any]:
    """Load default_non_current_liability_types.json data."""
    from importlib.resources import files
    import json
    json_file = files("accountable_contracts.data.generated.json") / "account/default_non_current_liability_types.json"
    return json.loads(json_file.read_text(encoding="utf-8"))

def get_financial_statement_ids() -> list[dict[str, Any]] | dict[str, Any]:
    """Load financial_statement_ids.json data."""
    from importlib.resources import files
    import json
    json_file = files("accountable_contracts.data.generated.json") / "account/financial_statement_ids.json"
    return json.loads(json_file.read_text(encoding="utf-8"))

def get_latest_enriched_transaction() -> list[dict[str, Any]] | dict[str, Any]:
    """Load latest_enriched_transaction.json data."""
    from importlib.resources import files
    import json
    json_file = files("accountable_contracts.data.generated.json") / "categorization/latest_enriched_transaction.json"
    return json.loads(json_file.read_text(encoding="utf-8"))

# Cached accessor functions (load once, reuse)

def account_element_ids() -> list[dict[str, Any]] | dict[str, Any]:
    """Get account_element_ids.json data (cached)."""
    global _account_element_ids_cache
    if _account_element_ids_cache is None:
        _account_element_ids_cache = get_account_element_ids()
    return _account_element_ids_cache

def account_type_keys() -> list[dict[str, Any]] | dict[str, Any]:
    """Get account_type_keys.json data (cached)."""
    global _account_type_keys_cache
    if _account_type_keys_cache is None:
        _account_type_keys_cache = get_account_type_keys()
    return _account_type_keys_cache

def default_account_types() -> list[dict[str, Any]] | dict[str, Any]:
    """Get default_account_types.json data (cached)."""
    global _default_account_types_cache
    if _default_account_types_cache is None:
        _default_account_types_cache = get_default_account_types()
    return _default_account_types_cache

def default_current_asset_types() -> list[dict[str, Any]] | dict[str, Any]:
    """Get default_current_asset_types.json data (cached)."""
    global _default_current_asset_types_cache
    if _default_current_asset_types_cache is None:
        _default_current_asset_types_cache = get_default_current_asset_types()
    return _default_current_asset_types_cache

def default_current_liability_types() -> list[dict[str, Any]] | dict[str, Any]:
    """Get default_current_liability_types.json data (cached)."""
    global _default_current_liability_types_cache
    if _default_current_liability_types_cache is None:
        _default_current_liability_types_cache = get_default_current_liability_types()
    return _default_current_liability_types_cache

def default_equity_types() -> list[dict[str, Any]] | dict[str, Any]:
    """Get default_equity_types.json data (cached)."""
    global _default_equity_types_cache
    if _default_equity_types_cache is None:
        _default_equity_types_cache = get_default_equity_types()
    return _default_equity_types_cache

def default_expense_types() -> list[dict[str, Any]] | dict[str, Any]:
    """Get default_expense_types.json data (cached)."""
    global _default_expense_types_cache
    if _default_expense_types_cache is None:
        _default_expense_types_cache = get_default_expense_types()
    return _default_expense_types_cache

def default_income_types() -> list[dict[str, Any]] | dict[str, Any]:
    """Get default_income_types.json data (cached)."""
    global _default_income_types_cache
    if _default_income_types_cache is None:
        _default_income_types_cache = get_default_income_types()
    return _default_income_types_cache

def default_non_current_asset_types() -> list[dict[str, Any]] | dict[str, Any]:
    """Get default_non_current_asset_types.json data (cached)."""
    global _default_non_current_asset_types_cache
    if _default_non_current_asset_types_cache is None:
        _default_non_current_asset_types_cache = get_default_non_current_asset_types()
    return _default_non_current_asset_types_cache

def default_non_current_liability_types() -> list[dict[str, Any]] | dict[str, Any]:
    """Get default_non_current_liability_types.json data (cached)."""
    global _default_non_current_liability_types_cache
    if _default_non_current_liability_types_cache is None:
        _default_non_current_liability_types_cache = get_default_non_current_liability_types()
    return _default_non_current_liability_types_cache

def financial_statement_ids() -> list[dict[str, Any]] | dict[str, Any]:
    """Get financial_statement_ids.json data (cached)."""
    global _financial_statement_ids_cache
    if _financial_statement_ids_cache is None:
        _financial_statement_ids_cache = get_financial_statement_ids()
    return _financial_statement_ids_cache

def latest_enriched_transaction() -> list[dict[str, Any]] | dict[str, Any]:
    """Get latest_enriched_transaction.json data (cached)."""
    global _latest_enriched_transaction_cache
    if _latest_enriched_transaction_cache is None:
        _latest_enriched_transaction_cache = get_latest_enriched_transaction()
    return _latest_enriched_transaction_cache

__all__ = [
    "get_account_element_ids",
    "account_element_ids",
    "get_account_type_keys",
    "account_type_keys",
    "get_default_account_types",
    "default_account_types",
    "get_default_current_asset_types",
    "default_current_asset_types",
    "get_default_current_liability_types",
    "default_current_liability_types",
    "get_default_equity_types",
    "default_equity_types",
    "get_default_expense_types",
    "default_expense_types",
    "get_default_income_types",
    "default_income_types",
    "get_default_non_current_asset_types",
    "default_non_current_asset_types",
    "get_default_non_current_liability_types",
    "default_non_current_liability_types",
    "get_financial_statement_ids",
    "financial_statement_ids",
    "get_latest_enriched_transaction",
    "latest_enriched_transaction",
]
