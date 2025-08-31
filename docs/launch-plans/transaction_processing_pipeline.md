# 📊 Week 3: Transaction Processing Pipeline

> **Timeline:** Week 3 (Days 15-19)  
> **Priority:** HIGH - Core user workflow  
> **Goal:** End-to-end flow from bank import → categorization → ledger entries

## 🎯 **What We're Building**

A robust pipeline that:

1. Imports transactions from banks/CSV
2. Deduplicates to prevent double-entry
3. Categorizes using hybrid engine (Week 2)
4. Creates balanced ledger entries
5. Queues low-confidence items for review
6. Maintains complete audit trail

## 📋 **Day-by-Day Implementation**

### **Day 15: Import & Deduplication**

**Transaction Fingerprinting:**

```typescript
// Prevent duplicate imports
generateFingerprint(txn: RawTransaction): string {
  const key = [
    txn.date,
    txn.amount.toFixed(2),
    txn.external_id || '',
    txn.payee || txn.description
  ].join('|');

  return crypto.createHash('sha256').update(key).digest('hex');
}

async importTransactions(bankAccountId: string, transactions: RawTransaction[]) {
  // 1. Get existing fingerprints
  const existing = await db('bank_transactions')
    .where('bank_account_id', bankAccountId)
    .select('fingerprint');

  // 2. Filter out duplicates
  const newTxns = transactions.filter(t =>
    !existing.includes(this.generateFingerprint(t))
  );

  // 3. Create import batch
  const batch = await this.createBatch({
    bank_account_id: bankAccountId,
    import_count: newTxns.length,
    status: 'processing'
  });

  // 4. Queue for processing
  await this.queue.addBulk(newTxns.map(txn => ({
    name: 'categorize-transaction',
    data: { transaction: txn, batchId: batch.id }
  })));
}
```

### **Day 16: Processing Queue**

**BullMQ Worker:**

```typescript
// apps/api/src/jobs/workers/transactionProcessor.ts
import { Worker } from 'bullmq';

const worker = new Worker('transactions', async (job) => {
  const { transaction, batchId } = job.data;

  try {
    // 1. Create bank transaction record
    const bankTxn = await createBankTransaction({
      ...transaction,
      batch_id: batchId,
      categorization_status: 'processing',
    });

    // 2. Categorize (using Week 2 engine)
    const result = await categorizationOrchestrator.categorize(bankTxn);

    // 3. Handle based on confidence
    if (result.confidence >= 0.8) {
      await createLedgerEntries(bankTxn, result);
      await updateStatus(bankTxn.id, 'categorized');
    } else {
      await queueForReview(bankTxn, result);
      await updateStatus(bankTxn.id, 'review_needed');
    }

    // 4. Emit progress update
    await emitProgress(batchId);
  } catch (error) {
    await handleError(job, error);
  }
});
```

**Real-time Status:**

```typescript
// WebSocket updates for UI
async emitProgress(batchId: string) {
  const stats = await db('bank_transactions')
    .where('batch_id', batchId)
    .groupBy('categorization_status')
    .select('categorization_status')
    .count('* as count');

  io.to(`batch:${batchId}`).emit('progress', {
    total: stats.reduce((sum, s) => sum + s.count, 0),
    categorized: stats.find(s => s.status === 'categorized')?.count || 0,
    reviewNeeded: stats.find(s => s.status === 'review_needed')?.count || 0
  });
}
```

### **Day 17: Human Review Queue**

**Review Interface:**

```typescript
// Queue management
interface ReviewItem {
  transactionId: string;
  transaction: BankTransaction;
  suggestedCategory: CategorizationResult;
  alternatives: Alternative[];
  priority: number; // Based on amount and confidence
}

async queueForReview(txn: BankTransaction, suggestion: CategorizationResult) {
  const priority = Math.abs(txn.amount) * (1 - suggestion.confidence);

  await db('review_queue').insert({
    transaction_id: txn.id,
    suggested_categorization: suggestion,
    alternatives: await getAlternatives(txn),
    priority,
    status: 'pending'
  });

  // Notify reviewers
  await notifyReviewers({
    type: 'new_review',
    transactionId: txn.id,
    amount: txn.amount,
    payee: txn.payee
  });
}
```

**Review UI Component:**

```tsx
// Simple review interface
function ReviewPanel({ item }: { item: ReviewItem }) {
  const [selectedCoa, setSelectedCoa] = useState(item.suggestedCategory.coaId);
  const [splits, setSplits] = useState<Split[]>([]);

  const handleApprove = async () => {
    // Create ledger entries with user's selection
    await api.approveCategorizatoin({
      transactionId: item.transactionId,
      coaId: selectedCoa,
      splits,
      explanation: 'Manual review approval',
    });

    // Record for ML training
    await api.recordCorrection({
      transactionId: item.transactionId,
      original: item.suggestedCategory,
      corrected: { coaId: selectedCoa, splits },
    });
  };

  return (
    <div>
      <TransactionDetails transaction={item.transaction} />
      <CoaSelector value={selectedCoa} onChange={setSelectedCoa} />
      <SplitEditor splits={splits} onChange={setSplits} />
      <Button onClick={handleApprove}>Approve</Button>
    </div>
  );
}
```

### **Day 18: Ledger Entry Creation**

**Critical: Balanced Entries**

```typescript
async createLedgerEntries(
  bankTxn: BankTransaction,
  categorization: CategorizationResult
): Promise<LedgerEntry[]> {
  // 1. Create parent ledger transaction
  const ledgerTxn = await db('ledger_transactions').insert({
    date: bankTxn.date,
    source: 'bank_import',
    description: bankTxn.description,
    bank_transaction_id: bankTxn.id,
    company_id: bankTxn.company_id
  }).returning('*');

  // 2. Create entries (MUST BALANCE!)
  const entries = [];

  // Known side (bank account)
  entries.push({
    ledger_transaction_id: ledgerTxn.id,
    coa_id: categorization.knownSide.coaId,
    source_amount: categorization.knownSide.side === 'debit'
      ? Math.abs(bankTxn.amount)
      : -Math.abs(bankTxn.amount),
    description: 'Bank account movement'
  });

  // Predicted side (may include splits)
  if (categorization.splits?.length > 0) {
    // Handle splits (bank fees, taxes, etc.)
    for (const split of categorization.splits) {
      entries.push({
        ledger_transaction_id: ledgerTxn.id,
        coa_id: split.coaId,
        source_amount: split.side === 'debit' ? split.amount : -split.amount,
        description: split.description
      });
    }
  } else {
    // Single entry
    entries.push({
      ledger_transaction_id: ledgerTxn.id,
      coa_id: categorization.predictedSide.coaId,
      source_amount: categorization.predictedSide.side === 'debit'
        ? Math.abs(categorization.predictedSide.amount)
        : -Math.abs(categorization.predictedSide.amount),
      description: categorization.explanation
    });
  }

  // 3. VALIDATE BALANCE
  const sum = entries.reduce((total, e) => total + e.source_amount, 0);
  if (Math.abs(sum) > 0.01) {
    throw new Error(`UNBALANCED ENTRIES! Sum=${sum}`);
  }

  // 4. Insert all entries
  await db('ledger_entries').insert(entries);

  // 5. Update bank transaction
  await db('bank_transactions')
    .where('id', bankTxn.id)
    .update({
      ledger_transaction_id: ledgerTxn.id,
      categorization_status: 'categorized'
    });

  return entries;
}
```

### **Day 19: Audit Trail & Testing**

**Complete Audit Trail:**

```typescript
// Track every decision
interface AuditEntry {
  transactionId: string;
  timestamp: Date;
  action: 'categorized' | 'reviewed' | 'corrected' | 'rolled_back';
  source: 'rule' | 'ml' | 'manual';
  confidence: number;
  decision: any;
  userId?: string;
  processingTimeMs: number;
}

async recordAudit(
  txn: BankTransaction,
  result: CategorizationResult,
  metadata: any
) {
  await db('categorization_audit').insert({
    transaction_id: txn.id,
    timestamp: new Date(),
    action: 'categorized',
    source: result.source,
    confidence: result.confidence,
    decision: JSON.stringify(result),
    user_id: metadata.userId,
    processing_time_ms: metadata.processingTime
  });
}
```

**End-to-End Test:**

```typescript
describe('Transaction Pipeline', () => {
  it('should process 100 transactions end-to-end', async () => {
    // 1. Import
    const batch = await importService.importFromCSV('test-100-txns.csv');

    // 2. Wait for processing
    await waitForBatchComplete(batch.id, { timeout: 30000 });

    // 3. Verify all processed
    const txns = await db('bank_transactions').where('batch_id', batch.id);

    expect(
      txns.every((t) => ['categorized', 'review_needed'].includes(t.categorization_status)),
    ).toBe(true);

    // 4. Verify balanced entries
    for (const txn of txns.filter((t) => t.categorization_status === 'categorized')) {
      const entries = await db('ledger_entries').where(
        'ledger_transaction_id',
        txn.ledger_transaction_id,
      );

      const sum = entries.reduce((total, e) => total + e.source_amount, 0);
      expect(Math.abs(sum)).toBeLessThan(0.01);
    }
  });
});
```

---

## ✅ **Week 3 Success Criteria**

- [ ] Import and process 1000 transactions in <30 seconds
- [ ] 85%+ auto-categorization rate
- [ ] 100% balanced ledger entries
- [ ] Human review queue operational
- [ ] Complete audit trail for all transactions
- [ ] Real-time progress updates
- [ ] Rollback capability for mistakes

## 🔥 **Critical Points**

1. **NEVER create unbalanced entries** - Always validate debits = credits
2. **ALWAYS maintain audit trail** - Every decision must be tracked
3. **Handle splits properly** - Bank fees, taxes, multiple categories
4. **Queue low-confidence for review** - Don't guess on important transactions

---

**Next Week:** Financial statement generation from these ledger entries
