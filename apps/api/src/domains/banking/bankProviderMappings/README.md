# Bank Provider Mappings

## Overview

The `bank_provider_mappings` table links a bank feed provider's institution identity to our canonical `banks` row.

## Purpose

**Prevent duplicate banks**: When the same financial institution appears across different providers, we maintain only one internal record.

## How It Works

1. **Internal Banks Table**: Canonical financial institution identities
2. **Provider Institutions**: Each integration (Plaid, Mono, etc.) assigns its own institution IDs
3. **Bridge Table**: `bank_provider_mappings` records which provider institution maps to which internal bank

## Example

- **Chase Bank** exists once in our `banks` table
- **Plaid** calls it `ins_123`
- **Mono** calls it `inst_xyz`
- **Result**: One Chase record, two rows in `bank_provider_mappings`

## Lifecycle

- Rows are created at runtime during provider discovery and bank resolution
- Not bootstrap catalog data
- Obsolete mappings are soft-deleted (`is_deleted`, `deleted_at`, `deleted_by_id`) to preserve audit history

## Benefits

- Single source of truth for bank information
- No duplicate bank records
- Efficient lookups across multiple providers
