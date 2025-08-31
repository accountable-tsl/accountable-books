# 🚀 Weeks 1-2: Plaid Integration + Hybrid Categorization Engine

> **Timeline:** First 2 weeks  
> **Priority:** CRITICAL - Cannot launch without these  
> **Goal:** Bank connections + 85% accurate transaction categorization

## 📋 **Week 1: Plaid Integration (Days 1-7)**

### **Day 1-2: Setup & Authentication**

```bash
# Environment Setup
PLAID_CLIENT_ID=xxx
PLAID_SECRET_KEY=xxx
PLAID_ENVIRONMENT=production  # Not sandbox!
PLAID_PRODUCTS=["transactions", "auth", "accounts"]
```

**Implementation:**

```typescript
// apps/api/src/lib/plaidClient.ts
import { PlaidApi, Configuration, PlaidEnvironments } from 'plaid';

const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[ENV.PLAID_ENVIRONMENT],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': ENV.PLAID_CLIENT_ID,
        'PLAID-SECRET': ENV.PLAID_SECRET_KEY,
      },
    },
  }),
);
```

### **Day 3-4: Account Linking Flow**

```typescript
// Create link token for frontend
async createLinkToken(userId: string, companyId: string) {
  const response = await plaidClient.linkTokenCreate({
    client_name: 'Accountable Books',
    country_codes: ['US'],
    language: 'en',
    user: { client_user_id: userId },
    products: ['transactions', 'accounts'],
    webhook: `${ENV.BACKEND_URL}/webhooks/plaid/${companyId}`
  });
  return response.data.link_token;
}

// Exchange public token for access token
async exchangeToken(publicToken: string, bankAccountId: string) {
  const exchange = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken
  });

  // Store encrypted access token
  await this.storeBankConnection({
    bank_account_id: bankAccountId,
    plaid_access_token: encrypt(exchange.data.access_token),
    plaid_item_id: exchange.data.item_id,
    status: 'connected'
  });
}
```

### **Day 5-6: Transaction Import**

```typescript
async fetchTransactions(bankAccountId: string, dateRange: DateRange) {
  const connection = await this.getBankConnection(bankAccountId);
  const accessToken = decrypt(connection.plaid_access_token);

  const response = await plaidClient.transactionsGet({
    access_token: accessToken,
    start_date: dateRange.start,
    end_date: dateRange.end,
    options: { count: 500, offset: 0 }
  });

  return this.transformPlaidTransactions(response.data.transactions);
}
```

### **Day 7: Webhooks & Testing**

```typescript
// Webhook handler for real-time updates
async handlePlaidWebhook(webhookType: string, itemId: string) {
  switch(webhookType) {
    case 'TRANSACTIONS_AVAILABLE':
      await this.syncNewTransactions(itemId);
      break;
    case 'ERROR':
      await this.handleConnectionError(itemId);
      break;
  }
}
```

---

## 🤖 **Week 2: Hybrid Categorization Engine (Days 8-14)**

### **Day 8-9: Business Rules Engine (Node.js)**

**Database Schema:**

```sql
CREATE TABLE business_rules (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,
  name VARCHAR(255),
  priority INT, -- Lower = higher priority
  conditions JSONB, -- {vendor: [], amount: {}, description: []}
  actions JSONB,    -- {debit_coa_id, credit_coa_id, confidence}
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE global_rules (
  id UUID PRIMARY KEY,
  category VARCHAR(100), -- 'office_supplies', 'utilities', etc.
  patterns JSONB,
  default_coa_mapping JSONB,
  priority INT DEFAULT 1000
);
```

**Implementation:**

```typescript
// apps/api/src/features/categorization/rulesEngine.ts
class BusinessRulesEngine {
  async categorize(transaction: BankTransaction, context: CompanyContext) {
    // 1. IMMUTABLE RULE: Bank side is always known
    const knownSide =
      transaction.amount < 0
        ? { side: 'credit', coaId: context.bankAccount.coaId }
        : { side: 'debit', coaId: context.bankAccount.coaId };

    // 2. Check company-specific rules
    const companyRules = await this.getCompanyRules(context.companyId);
    for (const rule of companyRules.sort((a, b) => a.priority - b.priority)) {
      if (this.matchesRule(transaction, rule)) {
        return {
          knownSide,
          predictedSide: rule.actions,
          confidence: rule.confidence,
          source: 'company_rule',
          explanation: rule.explanation,
        };
      }
    }

    // 3. Check global patterns
    const globalMatch = await this.matchGlobalPatterns(transaction);
    if (globalMatch) return globalMatch;

    // 4. No rule matched - need ML or manual
    return null;
  }
}
```

### **Day 10-11: ML Prediction Engine (Python)**

**Focus: Predict the OTHER side of double-entry**

```python
# apps/ml-engine/app/models/categorizer.py
from sklearn.ensemble import RandomForestClassifier
import pandas as pd

class TransactionCategorizer:
    def __init__(self):
        self.model = RandomForestClassifier(n_estimators=100)
        self.vendor_patterns = self.load_vendor_patterns()

    def predict_other_side(self, transaction_context):
        """
        Given: Bank account side (known)
        Predict: The OTHER account for double-entry
        """
        features = self.extract_features(transaction_context)

        # Different logic for cash vs accrual basis
        if transaction_context['accounting_basis'] == 'cash':
            # Cash basis: expenses recognized when paid
            prediction = self.predict_cash_basis(features)
        else:
            # Accrual: consider prepaid, assets, timing
            prediction = self.predict_accrual_basis(features)

        return {
            'coa_id': prediction['account'],
            'confidence': prediction['probability'],
            'explanation': self.generate_explanation(prediction, features)
        }

    def detect_splits(self, transaction):
        """Detect bank fees, taxes, multiple expenses"""
        splits = []

        # Common pattern: bank fees
        if 'fee' in transaction['description'].lower():
            fee_amount = self.extract_fee_amount(transaction)
            if fee_amount:
                splits.append({
                    'amount': fee_amount,
                    'coa_id': '6800',  # Bank Charges
                    'confidence': 0.95
                })

        return splits
```

### **Day 12-13: Integration & Context**

**Orchestration Layer:**

```typescript
// apps/api/src/features/categorization/orchestrator.ts
class CategorizationOrchestrator {
  async categorizeTransaction(bankTxn: BankTransaction) {
    // 1. Build context
    const context = await this.buildContext(bankTxn);

    // 2. Business rules first (fast, local)
    const ruleResult = await this.rulesEngine.categorize(bankTxn, context);
    if (ruleResult?.confidence >= 0.85) {
      return this.createLedgerEntries(bankTxn, ruleResult);
    }

    // 3. ML prediction (slower, but smarter)
    const mlResult = await this.mlService.predict(context);
    if (mlResult?.confidence >= 0.7) {
      return this.createLedgerEntries(bankTxn, mlResult);
    }

    // 4. Queue for human review
    return this.queueForReview(bankTxn, mlResult);
  }

  private async buildContext(transaction: BankTransaction) {
    const [company, bankAccount, vendor, history] = await Promise.all([
      this.getCompany(transaction.company_id),
      this.getBankAccount(transaction.bank_account_id),
      this.identifyVendor(transaction),
      this.getHistory(transaction),
    ]);

    return {
      transaction,
      company: {
        industry: company.industry,
        accountingBasis: company.accounting_basis,
        chartOfAccounts: await this.getCoA(company.id),
      },
      bankAccount: {
        coaId: bankAccount.coa_id, // THE KNOWN SIDE!
      },
      vendor,
      history,
    };
  }
}
```

### **Day 14: Validation & Testing**

**Critical Validations:**

```typescript
// MUST ensure debits = credits
validateLedgerEntries(entries: LedgerEntry[]) {
  const debits = entries.filter(e => e.side === 'debit').reduce((sum, e) => sum + e.amount, 0);
  const credits = entries.filter(e => e.side === 'credit').reduce((sum, e) => sum + e.amount, 0);

  if (Math.abs(debits - credits) > 0.01) {
    throw new Error(`UNBALANCED: Debits=${debits}, Credits=${credits}`);
  }
}

// MUST have complete explanation
validateExplanation(result: CategorizationResult) {
  if (!result.explanation || result.explanation.length < 10) {
    throw new Error('Every categorization MUST have clear explanation');
  }
}
```

---

## ✅ **Week 1-2 Success Criteria**

### **Plaid Integration**

- [ ] Connect to 5+ major US banks (Chase, BofA, Wells Fargo, etc.)
- [ ] Import transactions successfully
- [ ] Handle webhooks for real-time updates
- [ ] Secure token storage

### **Categorization Engine**

- [ ] 85%+ accuracy on common transactions
- [ ] Business rules engine operational
- [ ] ML predictions for complex cases
- [ ] Split transaction detection working
- [ ] 100% balanced entries (debits = credits)
- [ ] Complete audit trail

### **Performance**

- [ ] <500ms per transaction categorization
- [ ] Batch import 1000 transactions in <30 seconds
- [ ] Real-time status updates

---

## 🚨 **Critical Requirements**

### **Before ANY Categorization**

1. **Bank account MUST be linked to CoA asset account**
2. **Company accounting basis MUST be known**
3. **Bank transaction side determines known entry**

### **Categorization Flow**

```
Bank Transaction → Determine Known Side (Bank Account CoA)
                        ↓
                   Business Rules (85% coverage)
                        ↓ (if no match)
                   ML Prediction (enhancement)
                        ↓ (if low confidence)
                   Human Review Queue
                        ↓
                   Balanced Ledger Entries
```

### **Explainability Requirements**

Every categorization MUST include:

- Source (rule/ML/manual)
- Confidence score
- Clear explanation
- Alternative options
- Audit trail

---

## 🔥 **Immediate Next Steps**

### **This Week**

1. **Monday**: Set up Plaid production account
2. **Tuesday**: Implement Plaid client and auth
3. **Wednesday**: Build link token flow
4. **Thursday**: Transaction import logic
5. **Friday**: Start business rules engine

### **Critical Path Items**

- Plaid API credentials (production, not sandbox!)
- Database migrations for rules tables
- Python environment for ML service
- BullMQ for transaction processing queue

---

**Remember:** We're building a hybrid system where business rules provide immediate 85% accuracy, and ML enhances over time. The bank account side is ALWAYS known - we're predicting the OTHER side of the double-entry.
