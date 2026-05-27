"""Basic checks for contract account data shape."""

from accountable_contracts.data import default_account_types


def test_default_account_types_have_expected_fields():
    """Ensure default_account_types is a list of account dicts with required keys."""
    accounts = default_account_types()
    assert isinstance(accounts, list)
    assert accounts, "default_account_types should not be empty"

    required_keys = {"id", "key", "label", "label_role", "trainable"}
    first = accounts[0]
    assert required_keys.issubset(first.keys())

    # There should be at least one fallback account (used by Model A/B)
    assert any(a.get("label_role") == "fallback" for a in accounts)
