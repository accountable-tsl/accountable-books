# Batch Ledger Record Creation - Usage Examples

## Basic Usage

```typescript
import { createLedgerRecordsBatch } from './ledgers-batch.service';

const transactions = [
  {
    date: new Date('2025-01-15'),
    transaction_source: 'manual_journal',
    categorization_source: 'manual',
    source_transaction_currency_id: 'usd-currency-id',
    transactions: [
      {
        fs_date: '2025-01-15',
        coa_id: 'cash-account-id',
        source_currency_id: 'usd-currency-id',
        source_amount: -1000, // Debit
        description: 'Office supplies',
      },
      {
        fs_date: '2025-01-15',
        coa_id: 'expense-account-id',
        source_currency_id: 'usd-currency-id',
        source_amount: 1000, // Credit
        description: 'Office supplies',
      },
    ],
  },
  // ... more transactions
];

const result = await createLedgerRecordsBatch({
  transactions,
  companyId: 'company-123',
  userId: 'user-456',
});

if (result.success) {
  console.log(`Created ${result.data.count} transactions`);
  console.log(
    'Transaction IDs:',
    result.data.transactions.map((t) => t.ledgerTransactionId),
  );
} else {
  console.error('Failed:', result.error);
}
```

---

## Example 1: Bank Transaction Import

```typescript
// Importing 100 categorized bank transactions
const bankTransactions = await fetchBankTransactionsToImport();

const ledgerTransactions = bankTransactions.map((bt) => ({
  date: bt.date,
  transaction_source: 'bank_transaction' as const,
  categorization_source: 'ml_prediction' as const,
  source_transaction_id: bt.id,
  source_transaction_date: bt.date,
  source_transaction_amount: bt.amount,
  source_transaction_currency_id: bt.currency_id,
  description: bt.description,

  transactions: [
    // Bank leg (must match bank transaction amount)
    {
      fs_date: dayYMD(bt.date),
      coa_id: bt.bank_account_coa_id, // Must match bank account COA
      source_currency_id: bt.currency_id, // Must match bank account currency
      source_amount: bt.amount, // Must match bank transaction amount
      description: bt.description,
      is_bank_leg: true,
    },
    // Offsetting entry (categorization)
    {
      fs_date: dayYMD(bt.date),
      coa_id: bt.predicted_coa_id,
      source_currency_id: bt.currency_id,
      source_amount: -bt.amount, // Opposite sign
      description: bt.description,
      contact_id: bt.contact_id,
      project_id: bt.project_id,
    },
  ],
}));

const result = await createLedgerRecordsBatch({
  transactions: ledgerTransactions,
  companyId: 'company-123',
  userId: 'user-456',
});

// Result:
// - 100 ledger transactions created
// - Balance recalc enqueued once per affected COA (not 100 times)
// - All atomic: if one fails, all roll back
```

---

## Example 2: Multi-Currency FX Transactions

```typescript
const fxTransactions = [
  {
    date: new Date('2025-01-15'),
    transaction_source: 'manual_journal' as const,
    categorization_source: 'manual' as const,
    source_transaction_currency_id: 'eur-currency-id',

    transactions: [
      {
        fs_date: '2025-01-15',
        coa_id: 'eur-cash-account',
        source_currency_id: 'eur-currency-id',
        source_amount: -1000, // 1000 EUR debit
        description: 'EUR payment',
        custom_exchange_rate: 1.12, // Optional: override system rate
      },
      {
        fs_date: '2025-01-15',
        coa_id: 'expense-account',
        source_currency_id: 'eur-currency-id',
        source_amount: 1000, // 1000 EUR credit (converted to USD at 1.12)
        description: 'EUR payment',
      },
    ],
  },
  // ... more FX transactions
];

const result = await createLedgerRecordsBatch({
  transactions: fxTransactions,
  companyId: 'company-123',
  userId: 'user-456',
});

// System automatically:
// - Fetches EUR/USD exchange rate (or uses custom rate)
// - Validates rate is reasonable
// - Tracks FX position if enabled
// - Generates fx_transaction_id for monetary entries
```

---

## Example 3: Handling Errors

```typescript
const transactions = [...]; // 50 transactions

try {
  const result = await createLedgerRecordsBatch({
    transactions,
    companyId: 'company-123',
    userId: 'user-456',
  });

  if (!result.success) {
    // Validation error (all rolled back)
    console.error('Validation failed:', result.error);
    return;
  }

  // Success - check for warnings
  for (const tx of result.data.transactions) {
    if (tx.warnings) {
      console.warn(`Transaction ${tx.ledgerTransactionId} has warnings:`, tx.warnings);
      // Example warnings:
      // - fxWarnings: "Suspiciously large FX rate: 15000"
      // - constraintWarnings: "Period is closed but override enabled"
    }
  }

} catch (error) {
  // System error (database failure, etc.)
  console.error('System error:', error.message);

  if (error.message.includes('Transaction 7:')) {
    // Error in specific transaction
    console.error('Failed at transaction index 7');
  }
}
```

---

## Example 4: Chunking Large Batches

```typescript
// For very large imports (10,000+ transactions), chunk into batches
async function importLargeDataset(allTransactions: NewLedgerTransactionData[]) {
  const CHUNK_SIZE = 500; // Process 500 at a time
  const results = [];

  for (let i = 0; i < allTransactions.length; i += CHUNK_SIZE) {
    const chunk = allTransactions.slice(i, i + CHUNK_SIZE);

    console.log(
      `Processing chunk ${i / CHUNK_SIZE + 1} (${chunk.length} transactions)`,
    );

    const result = await createLedgerRecordsBatch({
      transactions: chunk,
      companyId: 'company-123',
      userId: 'user-456',
    });

    if (!result.success) {
      throw new Error(`Chunk failed at index ${i}: ${result.error}`);
    }

    results.push(...result.data.transactions);
  }

  return results;
}
```

---

## Example 5: Transaction with Splits

```typescript
// One bank transaction split into multiple categories
const splitTransaction = {
  date: new Date('2025-01-15'),
  transaction_source: 'bank_transaction' as const,
  categorization_source: 'manual' as const,
  source_transaction_id: 'bank-txn-123',
  source_transaction_date: new Date('2025-01-15'),
  source_transaction_amount: -1500,
  source_transaction_currency_id: 'usd-currency-id',

  transactions: [
    // Bank leg (matches total amount)
    {
      fs_date: '2025-01-15',
      coa_id: 'bank-account-coa',
      source_currency_id: 'usd-currency-id',
      source_amount: -1500, // Must match source_transaction_amount
      is_bank_leg: true,
    },
    // Split 1: Office supplies (60%)
    {
      fs_date: '2025-01-15',
      coa_id: 'office-supplies-expense',
      source_currency_id: 'usd-currency-id',
      source_amount: 900,
      description: 'Office supplies portion',
      project_id: 'project-A',
    },
    // Split 2: Marketing materials (40%)
    {
      fs_date: '2025-01-15',
      coa_id: 'marketing-expense',
      source_currency_id: 'usd-currency-id',
      source_amount: 600,
      description: 'Marketing materials portion',
      project_id: 'project-B',
    },
  ],
};

const result = await createLedgerRecordsBatch({
  transactions: [splitTransaction],
  companyId: 'company-123',
  userId: 'user-456',
});
```

---

## Example 6: Error Recovery

```typescript
// Retry failed transactions with better categorization
async function retryFailedTransactions(
  failedBatch: NewLedgerTransactionData[],
) {
  // Strategy 1: Fix validation errors
  const fixed = await fixValidationErrors(failedBatch);

  try {
    const result = await createLedgerRecordsBatch({
      transactions: fixed,
      companyId: 'company-123',
      userId: 'user-456',
    });

    if (result.success) {
      console.log('Retry successful!');
      return result;
    }
  } catch (error) {
    if (error.message.includes('Transaction ')) {
      // Extract failed transaction index
      const match = error.message.match(/Transaction (\d+):/);
      if (match) {
        const failedIndex = parseInt(match[1], 10);
        console.error(`Transaction ${failedIndex} failed:`, error.message);
        console.error('Failed data:', fixed[failedIndex]);
      }
    }

    // Strategy 2: Process one at a time to isolate failures
    return await processOneByOne(fixed);
  }
}

async function processOneByOne(transactions: NewLedgerTransactionData[]) {
  const successes = [];
  const failures = [];

  for (let i = 0; i < transactions.length; i++) {
    try {
      const result = await createLedgerRecordsBatch({
        transactions: [transactions[i]],
        companyId: 'company-123',
        userId: 'user-456',
      });

      if (result.success) {
        successes.push(result.data.transactions[0]);
      } else {
        failures.push({ index: i, error: result.error });
      }
    } catch (error) {
      failures.push({ index: i, error: error.message });
    }
  }

  return { successes, failures };
}
```

---

## Common Pitfalls

### ❌ DON'T: Mix currencies within a transaction

```typescript
// WRONG: Different source currencies in same transaction
{
  transactions: [
    { source_currency_id: 'usd-id', source_amount: -1000 },
    { source_currency_id: 'eur-id', source_amount: 900 }, // ❌ Different currency!
  ];
}
```

**Solution**: All entries must use the same `source_currency_id` (transaction-level field).

---

### ❌ DON'T: Forget to set is_bank_leg

```typescript
// WRONG: Bank transaction without bank leg flag
{
  transaction_source: 'bank_transaction',
  transactions: [
    { coa_id: 'bank-account', source_amount: -1000 }, // ❌ Missing is_bank_leg: true
    { coa_id: 'expense', source_amount: 1000 },
  ]
}
```

**Solution**: One entry must have `is_bank_leg: true`.

---

### ❌ DON'T: Use wrong COA for bank leg

```typescript
// WRONG: Bank leg COA doesn't match bank account
{
  source_transaction_id: 'bank-txn-123', // Bank account has coa_id: 'coa-456'
  transactions: [
    {
      coa_id: 'coa-999', // ❌ Wrong COA!
      is_bank_leg: true
    },
  ]
}
```

**Solution**: Bank leg `coa_id` must match bank account's `coa_id`.

---

### ❌ DON'T: Unbalanced entries

```typescript
// WRONG: Doesn't sum to zero
{
  transactions: [
    { source_amount: -1000 },
    { source_amount: 900 }, // ❌ -1000 + 900 = -100 (not zero)
  ];
}
```

**Solution**: Sum of all `source_amount` must equal zero (double-entry).

---

## Performance Tips

1. **Batch size**: Sweet spot is 100-500 transactions per batch
2. **Chunking**: For > 1000 transactions, chunk into batches of 500
3. **Parallel processing**: Run multiple batches in parallel (different companies)
4. **Memory**: Each transaction ≈ 2KB, so 500 transactions ≈ 1MB
5. **Database**: Ensure connection pool has sufficient connections

---

**Generated**: 2025-12-07
**Status**: Production Ready ✅
