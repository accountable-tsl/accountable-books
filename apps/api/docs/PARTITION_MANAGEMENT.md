# 🗂️ Partition Management Solution

This document explains the comprehensive partition management solution implemented to prevent DDL-within-transaction conflicts when inserting bank transactions and ledger entries.

## 🚨 Problem Solved

The original error occurred because:

```
"cannot CREATE TABLE .. PARTITION OF "bank_transactions" because it is being used by active queries in this session"
```

This happened when:

1. A transaction was inserting multiple bank transactions
2. The BEFORE INSERT trigger tried to create a new partition (DDL)
3. PostgreSQL doesn't allow DDL operations within transactions that are actively querying the parent table

## ✅ Solution Overview

Our solution separates partition creation from data insertion:

### 1. **Simplified Triggers**

- Removed dynamic partition creation from `bt_ensure_partition_before_insert`
- Removed dynamic partition creation from `le_ensure_partition_before_insert`
- Triggers now just return NEW without attempting DDL operations

### 2. **Application-Level Partition Management**

- Pre-insert partition checks in `bankTransactions.model.ts`
- Dedicated partition management service
- Automatic partition creation BEFORE starting transactions

### 3. **Background Maintenance**

- Scheduled partition creation for future years
- Smart volume-based transition to monthly partitions
- Default partition draining

## 📁 File Structure

```
src/
├── shared/services/
│   └── partitionManagement.service.ts     # Core partition management logic
├── domains/bankTransactions/
│   └── bankTransactions.model.ts          # Updated with pre-insert checks
├── jobs/
│   ├── queues/
│   │   └── partition-maintenance.queue.ts  # Background job queue
│   └── workers/
│       └── partition-maintenance.worker.ts # Background job worker
├── lib/
│   └── bullboard.ts                       # Updated with new queue
└── migrations/sql/
    ├── 001_bank_transactions.sql          # Simplified trigger
    └── 002_ledger_entries.sql             # Simplified trigger
```

## 🔧 How It Works

### Bank Transaction Insertion Flow

1. **Pre-Transaction Check** (NEW):

   ```typescript
   // Before starting the main transaction
   const transactionDates = batch.bank_transactions.map((txn) => new Date(txn.date));
   await ensurePartitionsForDates('bank_transactions', transactionDates);
   ```

2. **Main Transaction**:

   ```typescript
   // Now start the transaction - partitions already exist
   const result = await knexClient.transaction(async (trx) => {
     // Insert bank transactions safely
   });
   ```

3. **Simplified Trigger**:
   ```sql
   -- Just returns NEW, no DDL operations
   CREATE OR REPLACE FUNCTION bt_ensure_partition_before_insert()
   RETURNS TRIGGER LANGUAGE plpgsql AS $$
   BEGIN
     RETURN NEW;
   END$$;
   ```

### Background Maintenance

1. **Smart Partition Creation**:
   - Daily job at 2 AM creates partitions for next 3 years
   - Automatically switches to monthly partitions if volume > 100k/year
   - Handles both `bank_transactions` and `ledger_entries`

2. **Default Partition Draining**:
   - Every 4 hours moves records from default to proper partitions
   - Ensures optimal query performance

## 🚀 Usage

### Manual Partition Creation

```typescript
import { ensurePartitionsForDates } from '../shared/services/partitionManagement.service.js';

// Ensure partitions exist for specific dates
await ensurePartitionsForDates('bank_transactions', [
  new Date('2025-06-01'),
  new Date('2026-12-25'),
]);
```

### Background Jobs

```typescript
import {
  scheduleSmartPartitionMaintenance,
  scheduleDefaultPartitionDraining,
} from '../jobs/queues/partition-maintenance.queue.js';

// Schedule maintenance (done automatically on startup)
await scheduleSmartPartitionMaintenance();
await scheduleDefaultPartitionDraining();
```

### Environment Variables

```env
# Partition maintenance worker (enabled by default)
ENABLE_PARTITION_MAINTENANCE=true
PARTITION_MAINTENANCE_CONCURRENCY=1
```

## 📊 Monitoring

### Bull Board Dashboard

Access queue status at: `/admin/queues`

- Monitor partition maintenance jobs
- View failed jobs and retry them
- Check job scheduling and execution

### Logs

```bash
# Worker startup
🗂️  Starting partition maintenance worker...
✅ Partition maintenance worker started successfully

# Job processing
🗂️  Processing partition job: smart_maintenance
✅ Smart partition maintenance completed
```

## 🧪 Testing

Run the validation script:

```bash
npx tsx scripts/testPartitionManagement.ts
```

This script:

- ✅ Creates partitions for future dates
- ✅ Verifies partition existence
- ✅ Tests smart maintenance logic
- ✅ Validates both bank_transactions and ledger_entries

## 🔄 Migration Path

### For Existing Installations:

1. **Apply SQL Changes**:

   ```sql
   -- Update triggers (already in migration files)
   \i migrations/sql/001_bank_transactions.sql
   \i migrations/sql/002_ledger_entries.sql
   ```

2. **Deploy Application Code**:
   - New partition management service
   - Updated bank transaction model
   - Background worker setup

3. **Initialize Scheduled Jobs**:
   ```typescript
   import { initializePartitionMaintenanceSchedule } from '../shared/services/partitionManagement.service.js';
   await initializePartitionMaintenanceSchedule();
   ```

## 📈 Performance Benefits

1. **No More DDL Conflicts**: Eliminates the transaction error completely
2. **Proactive Partition Creation**: Partitions exist before they're needed
3. **Smart Volume Handling**: Automatically adapts to data growth
4. **Background Processing**: No impact on user-facing operations
5. **Comprehensive Coverage**: Handles both tables with same pattern

## 🛡️ Reliability Features

1. **Graceful Failure Handling**: If partition creation fails, inserts go to default partition
2. **Retry Logic**: Background jobs have exponential backoff retry
3. **Advisory Locks**: Prevents race conditions during partition creation
4. **Monitoring**: Full observability through Bull Board and logs
5. **Environment Control**: Can disable workers if needed

## 🔮 Future Enhancements

1. **Dynamic Monthly Transition**: Could add triggers to switch existing yearly partitions to monthly when volume threshold is hit
2. **Custom Scheduling**: Allow per-company partition strategies
3. **Partition Pruning**: Automatically drop very old partitions
4. **Performance Metrics**: Track partition creation times and success rates

---

💡 **This solution scales with your business and prevents partition-related errors while maintaining optimal database performance!**
