# 🏦 Account Sync Implementation Plan

> **Priority:** MVP CRITICAL - Cannot launch without this  
> **Status:** Planning Phase  
> **Last Updated:** January 2025

## 🎯 **What We're Building**

**Goal**: Discover Plaid item → Institution(s) → Accounts; upsert banks + provider mappings; create bank_accounts + bank_account_connections; return accounts for classification.

**Success Criteria**: Once we can retrieve account details from provider, mark as successful (even if DB writes fail - we store orphaned records and report for debugging).

### **Complete Flow**
1. **Discover Item** - Get Plaid item details (stored in company_bank_credentials)
2. **Fetch Institution & Accounts** - Get institution and account details from provider
3. **Upsert Institution** - Check/create banks table + bank_provider_mappings  
4. **Create Account Records** - Store in bank_accounts + bank_account_connections
5. **Return for Classification** - Send account details to frontend for business/personal classification
6. **Handle Failures Gracefully** - Store orphaned connections and report issues

## 🔍 **Why This Matters**

- **MVP Requirement**: Cannot launch without account discovery and storage
- **Transaction Sync Foundation**: Need accounts before we can sync transactions
- **User Experience**: Users need to see what accounts they connected
- **Data Integrity**: Proper linking prevents duplicate accounts and sync issues

## 🏗️ **Current State vs Target State**

### ✅ **What's Already Working**

- User connects bank → gets access token → stored in `company_bank_credentials`
- Provider registry and basic Plaid integration
- Database schema for banks, bank_accounts, bank_account_connections

### ❌ **What's Missing (MVP Blockers)**

- Fetching accounts from Plaid after connection
- Creating institution records in our `banks` table
- Creating bank account records in `bank_accounts` table
- Linking provider accounts to our bank accounts
- Frontend endpoints to view and classify accounts

## 🔄 **Complete User Flow (Async Architecture)**

```
Frontend Flow:
1. User connects bank via Plaid widget ✅ (existing)
2. Plaid returns public token ✅ (existing)
3. We exchange for access token ✅ (existing)
4. Store credential in company_bank_credentials ✅ (existing)
5. 🆕 IMMEDIATE SUCCESS RESPONSE (for good UX)

Background Async Flow:
6. 🆕 Fetch item + institution details from Plaid
7. 🆕 Fetch accounts from Plaid using access token
8. 🆕 Check bank_provider_mappings (avoid duplicate institutions)
9. 🆕 Upsert institution in banks table + create mapping
10. 🆕 Create bank_accounts + bank_account_connections
11. 🆕 On failure: Create orphaned connections for debugging
12. 🆕 Notify frontend when sync completes

Frontend Continuation:
13. 🆕 Poll /banking/sync-status or use WebSocket
14. 🆕 Display account list when sync completes
15. 🆕 User classifies accounts as business/personal
16. 🆕 Update bank_accounts.business_or_personal field
```

## 📋 **Implementation Todo List**

### **Phase 1: Core Provider Enhancement**

_Why: Need to fetch accounts and institution data from Plaid_

- [ ] **Update BankingProvider interface** (`types/base.ts`)
  - [ ] Add `getItemDetails(accessToken)` method
  - [ ] Add `getAccounts(accessToken)` method
  - [ ] Define return types for Item and Account data

- [ ] **Implement PlaidProvider methods** (`providers/plaid.provider.ts`)
  - [ ] `getItemDetails()` - calls `item/get` endpoint, returns institution_id + metadata
  - [ ] `getAccounts()` - calls `accounts/get` endpoint, returns account list
  - [ ] Handle Plaid-specific errors and rate limits

### **Phase 2: Institution Management**

_Why: Need to store bank institution details and link to providers_

- [ ] **Create InstitutionService** (`services/institution.service.ts`)
  - [ ] `createInstitutionIfNotExists()` - check/create bank in `banks` table
  - [ ] `createBankProviderMapping()` - link provider institution to our bank
  - [ ] Handle country codes, bank keys, currency mapping

- [ ] **Database Integration**
  - [ ] Use existing `banks` table structure
  - [ ] Create `bank_provider_mappings` entries
  - [ ] Handle currency and country validation

### **Phase 3: Account Management**

_Why: Need to store individual account details from the provider_

- [ ] **Create AccountService** (`services/account.service.ts`)
  - [ ] `createBankAccounts()` - create entries in `bank_accounts` table
  - [ ] Map provider account types to our schema
  - [ ] Handle account numbers, names, types, balances

- [ ] **Create ConnectionService** (`services/connection.service.ts`)
  - [ ] `createBankAccountConnections()` - link provider accounts to ours
  - [ ] Handle connection status and metadata
  - [ ] Link to company and bank account records

### **Phase 4: Async Integration Flow**

_Why: Need to orchestrate the entire process with background processing_

- [ ] **Create AccountSyncService** (`services/accountSync.service.ts`)
  - [ ] `syncAccountsAfterConnection(credentialId)` - main orchestration method
  - [ ] `ensureInstitution()` - check bank_provider_mappings first, then create if needed
  - [ ] `createOrphanedConnections()` - create connections with NULL bank_account_id on failure
  - [ ] Handle all operations within transactions for atomicity

- [ ] **Enhance BankingService** (`banking.service.ts`)
  - [ ] Modify `exchangeToken()` to return immediate success
  - [ ] Add `triggerAccountSync()` for background processing
  - [ ] Use BullMQ or direct async call for background sync
  - [ ] Handle partial failures gracefully

- [ ] **Error Handling & Recovery**
  - [ ] Create orphaned bank_account_connections for debugging failed syncs
  - [ ] Log each step with proper context for debugging
  - [ ] Send alerts to Slack/Sentry for sync failures
  - [ ] Make all operations idempotent for safe retries

### **Phase 5: Frontend Integration**

_Why: Users need to see and classify their connected accounts_

- [ ] **New API Endpoints**
  - [ ] `GET /banking/accounts` - list connected accounts with sync status
  - [ ] `PUT /banking/accounts/:id/classify` - update business_or_personal field
  - [ ] `GET /banking/sync-status/:credentialId` - check account sync progress
  - [ ] All endpoints properly scoped to company and authenticated

- [ ] **Frontend Components** (in web app)
  - [ ] Account list view
  - [ ] Account classification form
  - [ ] Connection status indicators

## 🗄️ **Database Schema Changes**

### **No New Tables Required** ✅

- `banks` - already exists, stores institution details
- `bank_accounts` - already exists, stores account details
- `bank_account_connections` - already exists, links provider accounts to ours
- `company_bank_credentials` - already exists, stores access tokens

### **Data Flow**

```
company_bank_credentials (stores access token + item_id)
         ↓
    Plaid API calls (item/get + accounts/get)
         ↓
    bank_provider_mappings (check existing first)
         ↓
    banks table (create institution if not exists)
         ↓
    bank_accounts table (create account records)
         ↓
    bank_account_connections (link provider accounts to our records)
         ↓
    On failure: orphaned connections (NULL bank_account_id) for debugging
```

### **Fault Tolerance & Monitoring**

- **Orphaned Connection Tracking**: Create bank_account_connections with NULL bank_account_id when sync fails
- **Monitoring Dashboard**: Track sync success/failure rates
- **Alerting**: Slack notifications for failed syncs
- **Health Checks**: Regular monitoring of orphaned connections
- **Retry Logic**: Idempotent operations allow safe retries
- **Partial Success Handling**: Store what we can, report what failed

## 🔧 **Technical Implementation Details**

### **Provider Interface Updates**

```typescript
interface BankingProvider {
  // Existing methods...

  // NEW: Get Item/Institution details
  getItemDetails(accessToken: string): Promise<{
    itemId: string;
    institutionId: string;
    institutionName: string;
    metadata?: Record<string, any>;
  }>;

  // NEW: Get accounts for specific Item
  getAccounts(accessToken: string): Promise<{
    accounts: Array<{
      accountId: string;
      name: string;
      type: string;
      subtype?: string;
      mask?: string;
      // ... other provider-specific fields
    }>;
  }>;
}
```

### **Service Layer Architecture**

```typescript
// Enhanced BankingService with async processing
class BankingService {
  async exchangeToken(params): Promise<ApiResponse> {
    // 1. Exchange token with provider
    // 2. Store in company_bank_credentials (existing)
    // 3. IMMEDIATELY return success for good UX
    // 4. Trigger background account sync
    return successResponse('Connected successfully', {
      credentialId: credential.id,
      syncStatus: 'pending'
    });
  }

  private async triggerAccountSync(credentialId: string): Promise<void> {
    // Background job via BullMQ or direct async call
    accountSyncService.syncAccountsAfterConnection(credentialId)
      .catch(this.handleSyncFailure);
  }
}

// New AccountSyncService for orchestration
class AccountSyncService {
  async syncAccountsAfterConnection(credentialId: string): Promise<SyncResult> {
    try {
      // 1. Get credential & decrypt token
      // 2. Fetch item details + accounts from provider
      // 3. Ensure institution exists (check mappings first)
      // 4. Create bank accounts + connections in transaction
      // 5. Return success
    } catch (error) {
      // Create orphaned connections for debugging
      await this.createOrphanedConnections(credentialId, error);
      throw error;
    }
  }

  private async ensureInstitution(
    itemDetails: ItemDetails,
    credential: Credential
  ): Promise<string> {
    // 1. Check bank_provider_mappings FIRST
    const mapping = await knex('bank_provider_mappings')
      .where({
        provider_id: credential.provider_id,
        provider_bank_id: itemDetails.institutionId
      })
      .first();
    
    if (mapping) return mapping.bank_id;
    
    // 2. Create new bank + mapping only if not exists
    return await this.createInstitutionWithMapping(itemDetails, credential);
  }

  private async createOrphanedConnections(
    credentialId: string,
    error: Error
  ): Promise<void> {
    // Create bank_account_connections with NULL bank_account_id for debugging
    await knex('bank_account_connections').insert({
      provider_bank_account_id: 'sync_failed',
      bank_account_id: null, // NULL indicates sync failure
      provider_id: credential.provider_id,
      status: 'error',
      raw_metadata: {
        error: error.message,
        credential_id: credentialId,
        sync_attempt: new Date()
      }
    });
  }
}
```

## 🚀 **Implementation Order**

### **Week 1: Foundation**

1. Update provider interfaces and implement Plaid methods
2. Test with Plaid sandbox accounts
3. Create basic service structure

### **Week 2: Core Logic**

1. Implement institution management
2. Implement account creation
3. Implement connection linking
4. Test end-to-end flow

### **Week 3: Integration & Polish**

1. Integrate into exchange token flow
2. Add comprehensive error handling
3. Create frontend endpoints
4. End-to-end testing

### **Week 4: Testing & Documentation**

1. Test with real Plaid accounts
2. Performance testing
3. Documentation updates
4. Prepare for Mono integration

## 🧪 **Testing Strategy**

### **Unit Tests**

- Provider methods (Plaid API mocking)
- Service layer logic
- Database operations

### **Integration Tests**

- End-to-end account sync flow
- Error handling scenarios
- Partial failure recovery

### **Manual Testing**

- Plaid sandbox accounts
- Real Plaid accounts (test environment)
- Edge cases (no accounts, multiple accounts, etc.)

## 🔮 **Future Extensibility**

### **Mono Integration**

- Implement same interface methods
- Handle Mono-specific account types
- Test with Nigerian bank accounts

### **Other Providers**

- Teller, GoCardless, etc.
- Same interface, different implementation
- Easy to add via provider registry

### **Advanced Features**

- Account balance syncing
- Transaction categorization
- Webhook handling for real-time updates

## ❓ **Implementation Decisions Made**

1. **Error Recovery**: ✅ Create orphaned connections (NULL bank_account_id) for debugging failed syncs
2. **Performance**: ✅ Background async processing for better UX - immediate success response
3. **Institution Deduplication**: ✅ Always check bank_provider_mappings first before creating new banks
4. **Success Criteria**: ✅ Success = able to retrieve accounts from provider (even if DB writes fail)

## ❓ **Remaining Open Questions**

1. **Currency Handling**: How to handle provider currency vs company reporting currency?
2. **Account Types**: Map provider account types (checking, savings) to our bank_account_type enum?
3. **Retry Strategy**: How many times and when to retry failed syncs?
4. **Webhook Integration**: Should we use Plaid webhooks for real-time account updates?

## 📚 **Related Documentation**

- [Banking Integration Overview](./01_banking_integration.md)
- [Database Schema](../domains/banks/banks.types.ts)
- [Provider Interface](../types/base.ts)
- [Frontend Banking Flow](../../../../web/src/features/banking/README.md)

---

## 🎯 **Success Metrics**

- **UX Success**: User sees immediate success after token exchange
- **Sync Success**: >95% of accounts successfully synced to database
- **Error Recovery**: All failed syncs tracked via orphaned connections
- **Performance**: Account sync completes within 30 seconds background
- **Reliability**: Idempotent operations allow safe retries

---

**Next Step**: ✅ Plan updated with async architecture, fault tolerance, and institution deduplication. Ready to start with Phase 1 (Provider Enhancement).
