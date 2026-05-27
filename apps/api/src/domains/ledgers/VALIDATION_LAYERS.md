# Ledger Transaction Validation Layers

This document describes the multiple validation layers in the `updateOrCreateLedger` function that ensure data integrity and enforce business rules.

## Overview

The validation strategy uses **defense in depth** with multiple layers:

1. **Early Validation** - Before change detection (rejects invalid requests immediately)
2. **Change Detection Validation** - During analysis (detects specific constraint violations)
3. **Business Logic Validation** - In specialized functions (enforces domain rules)
4. **Database Constraints** - Final safety net (prevents corrupt data)

---

## Validation Layer 1: Early Validation (Pre-Change Detection)

**Location:** `updateOrCreateLedger()` lines 1354-1423
**Purpose:** Reject invalid requests before any expensive operations
**When:** After fetching existing transaction, before `detectChangedFields()`

### 1.1 Transaction-Level Immutability Validation

**Rule:** Transaction-level fields from source cannot be modified

**Immutable Fields:**

```typescript
[
  'date', // Fiscal period assignment
  'transaction_source', // Audit trail integrity
  'categorization_source', // Audit trail integrity
  'contact_id', // Source payer/payee
  'contact_type', // Source payer/payee
  'source_transaction_id', // Link to bank_transaction/journal_batch
  'source_transaction_date', // Source date
  'source_transaction_amount', // Source amount
  'source_transaction_currency_id', // Source currency
  'categorization_candidate_id', // ML prediction link
];
```

**Error Response:**

```typescript
throw new AppError(
  `Cannot modify immutable transaction-level fields: ${fields.join(', ')}.
   These fields are set at creation from the source transaction and cannot be changed.`,
  { violatedFields, existingLedgerTransactionId },
);
```

**Rationale:**

- **Date Immutability:** Prevents moving transactions across fiscal periods
- **Source Link Integrity:** Maintains reconciliation to bank_transactions
- **Audit Trail:** Prevents tampering with categorization history
- **Contact Semantics:** Transaction contact = original source; entry contacts = allocations

### 1.2 Bank Transaction Currency Validation

**Rule:** All entries in a bank transaction must use the bank account's currency

**Validation:**

```typescript
if (isBankTransaction && txnData.transactions) {
  const expectedCurrencyId = existingTxn.source_transaction_currency_id;
  // Check each entry.source_currency_id === expectedCurrencyId
}
```

**Error Response:**

```typescript
throw new AppError(
  `All entries in a bank transaction must use the bank account's currency (${currencyId})`,
  {
    violatedEntries: [{ entryIndex, providedCurrencyId, expectedCurrencyId }],
  },
);
```

**Rationale:**

- Bank transactions are denominated in a single currency (the bank account's currency)
- FX conversion happens at ledger level via `resolveFx()` using a single source currency
- Multi-currency entries within one bank transaction would break reconciliation

---

## Validation Layer 2: Change Detection Validation

**Location:** `detectChangedFields()` in `ledgers.utils.ts` lines 472-520
**Purpose:** Detect specific constraint violations during change analysis
**When:** Called from `updateOrCreateLedger()` after early validation

### 2.1 Bank Leg Immutability Validation

**Rule:** Bank leg fields must never change (they mirror the source bank_transaction)

**Immutable Bank Leg Fields:**

```typescript
[
  'coa_id', // Must match bank_account.coa_id
  'source_currency_id', // Must match bank_account.currency_id
  'source_amount', // Must match bank_transaction.amount
];
```

**Validation Logic:**

```typescript
if (isBankTransaction) {
  const bankLegIndex = existingEntries.findIndex((e) => e.is_bank_leg === true);
  if (bankLegIndex !== -1) {
    const immutableFields = ['coa_id', 'source_currency_id', 'source_amount'];
    // Check if any changed
  }
}
```

**Error Response:**

```typescript
{
  bankLegViolation: {
    entryIndex: number,
    violatedFields: string[],
    message: `Bank leg immutability violation: Cannot change ${fields.join(', ')}
              on bank leg. These fields must always match the source bank transaction.`
  }
}
```

**Handling in `updateOrCreateLedger`:**

```typescript
if (changes.bankLegViolation) {
  throw new AppError(changes.bankLegViolation.message, {
    entryIndex: changes.bankLegViolation.entryIndex,
    violatedFields: changes.bankLegViolation.violatedFields,
  });
}
```

**Rationale:**

- Bank leg represents the bank account side of the transaction
- Must always reconcile to the original bank_transaction record
- Changing these fields would break bank reconciliation
- Prevents user error (e.g., selecting wrong bank account after posting)

---

## Validation Layer 3: Business Logic Validation

**Location:** `createLedgerRecord()` (called by `supersedeLedgerTransaction()`)
**Purpose:** Enforce domain rules during transaction creation
**When:** Every time a new ledger transaction is created (including supersession)

### 3.1 Bank Leg Structure Validation

**Lines:** 207-216

**Rules:**

- Only bank transactions can have bank legs
- Bank transactions must have exactly one bank leg
- Bank leg must be marked with `is_bank_leg: true`

**Errors:**

```typescript
throw new AppError('Bank leg entries only allowed for bank transactions');
throw new AppError('Bank transaction must have exactly one bank leg entry');
```

### 3.2 Bank Leg Amount Validation

**Lines:** Uses `validateBankLegAmount()` utility

**Rule:** Bank leg source_amount must match bank_transaction.amount (magnitude)

**Validation:**

```typescript
const validation = validateBankLegAmount({
  entries,
  bankTransactionAmount: bankTxn.amount,
});

if (!validation.valid) {
  throw new AppError(validation.error);
}
```

**Tolerance:** 0.01 (epsilon for floating point comparison)

### 3.3 Bank Leg Currency Validation

**Line:** 278

**Rule:** Bank leg currency must match bank account currency

**Validation:**

```typescript
if (bankLeg.source_currency_id !== bankTxn.bank_currency_id) {
  throw new AppError(
    `Bank leg currency (${bankLeg.source_currency_id}) does not match
     bank account currency (${bankTxn.bank_currency_id})`,
  );
}
```

### 3.4 Double-Entry Balance Validation

**Rule:** All transactions must balance (sum of entries = 0)

**Validation:**

```typescript
const total = entries.reduce((sum, e) => sum + e.source_amount, 0);
if (Math.abs(total) > 0.01) {
  throw new AppError('Transaction does not balance');
}
```

---

## Validation Layer 4: Constraint System

**Location:** `createLedgerRecord()` calls `runConstraints()`
**Purpose:** Run registered business constraints
**When:** Before creating ledger transaction

**Example Constraints:**

- Account must not be deleted
- Period must be open
- Account must allow monetary transactions
- Custom business rules

**Error Handling:**

```typescript
const constraintResult = await runConstraints({
  companyUUID,
  entries,
  transactionDate,
});

if (!constraintResult.isValid) {
  // Collect errors and warnings
}
```

---

## Validation Layer 5: Database Constraints

**Purpose:** Final safety net if all other layers fail
**When:** Database insert/update operations

**Constraints:**

- Foreign key constraints (coa_id, currency_id, etc.)
- Not null constraints
- Check constraints
- Unique constraints

---

## Validation Flow for Update Operations

```
User Request
    │
    ▼
┌─────────────────────────────────────────────┐
│ EARLY VALIDATION (Layer 1)                  │
│ • Transaction-level immutability             │
│ • Bank transaction currency consistency      │
└─────────────────────────────────────────────┘
    │ (throws if violated)
    ▼
┌─────────────────────────────────────────────┐
│ CHANGE DETECTION (Layer 2)                  │
│ detectChangedFields()                        │
│ • Bank leg immutability                      │
│ • Field classification                       │
└─────────────────────────────────────────────┘
    │ (throws if bank leg violated)
    ▼
┌─────────────────────────────────────────────┐
│ ROUTING                                      │
│ • No changes      → return existing          │
│ • Metadata only   → updateLedgerMetadata()   │
│ • Accounting      → supersedeLedgerTransaction() │
└─────────────────────────────────────────────┘
    │ (if supersede)
    ▼
┌─────────────────────────────────────────────┐
│ SUPERSESSION                                 │
│ • Soft-delete old transaction                │
│ • Call createLedgerRecord() with new data    │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ BUSINESS LOGIC VALIDATION (Layer 3)         │
│ createLedgerRecord()                         │
│ • Bank leg structure                         │
│ • Bank leg amount match                      │
│ • Bank leg currency match                    │
│ • Double-entry balance                       │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ CONSTRAINT SYSTEM (Layer 4)                 │
│ runConstraints()                             │
│ • Custom business rules                      │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ DATABASE CONSTRAINTS (Layer 5)              │
│ INSERT/UPDATE operations                     │
└─────────────────────────────────────────────┘
    │
    ▼
Success
```

---

## Why Multiple Layers?

### 1. **Early Failure = Better UX**

- Layer 1 rejects invalid requests immediately
- User gets clear error message without wasting resources
- No partial processing or rollbacks needed

### 2. **Separation of Concerns**

- Layer 1: Request validation
- Layer 2: Change analysis
- Layer 3: Domain rules
- Layer 4: Business constraints
- Layer 5: Data integrity

### 3. **Defense in Depth**

- If one layer has a bug, others catch it
- Prevents data corruption
- Maintains audit trail integrity

### 4. **Clear Error Messages**

- Each layer provides context-specific errors
- Users understand exactly what went wrong
- Easier debugging and support

---

## Testing Strategy

### Unit Tests

- Test each validation layer independently
- Verify error messages are clear
- Ensure all edge cases covered

### Integration Tests

- Test full flow with real database
- Verify layers work together
- Test rollback behavior on failure

### Negative Tests (Critical)

- Attempt to modify immutable fields
- Try to change bank leg
- Provide mismatched currencies
- Send unbalanced entries
- All should fail gracefully with clear errors

---

## Maintenance Notes

### Adding New Immutable Fields

1. Add to `immutableTransactionFields` array (Layer 1)
2. Add to `TRANSACTION_IMMUTABLE_FIELDS` constant (for reusability)
3. Update supersession logic to preserve field
4. Add tests

### Adding New Constraints

1. Use constraint system (Layer 4) for business rules
2. Use Layer 1 for structural/format validation
3. Document in this file

### When to Use Which Layer

- **Layer 1:** Structural validation, immutability, format checks
- **Layer 2:** Change-specific validation (e.g., bank leg during updates)
- **Layer 3:** Domain rules enforced during creation
- **Layer 4:** Configurable business rules
- **Layer 5:** Last resort (prefer higher layers)

---

**Last Updated:** 2025-12-07
**Author:** Implementation of updateOrCreateLedger function
