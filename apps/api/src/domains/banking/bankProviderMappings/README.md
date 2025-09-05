# Bank Provider Mappings

## Overview

The `bank_provider_mappings` table serves as a bridge between external banking providers and our internal bank records.

## Purpose

**Prevent Duplicate Banks**: When the same financial institution appears across different providers, we maintain only one internal record.

## How It Works

1. **Internal Banks Table**: We maintain our own records of financial institutions
2. **Provider Mappings**: Each external provider (Plaid, Mono, Teller) has their own IDs for banks
3. **Bridge Table**: `bank_provider_mappings` links external provider IDs to our internal bank records

## Example

- **Chase Bank** exists once in our `banks` table
- **Plaid** calls it `aaaa`
- **Teller** calls it `bbbb`
- **Result**: One Chase record, two mappings in `bank_provider_mappings`

## Benefits

- Single source of truth for bank information
- No duplicate bank records
- Efficient lookups across multiple providers
