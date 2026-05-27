"""
Python package entrypoint for Accountable Contracts.

Exports schema and data subpackages so consumers can import
`accountable_contracts.schema` and `accountable_contracts.data`.
"""

from . import schema, data  # noqa: F401

__all__ = ["schema", "data"]
