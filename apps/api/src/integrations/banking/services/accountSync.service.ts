// import type { Knex } from 'knex';
// import { knexClient } from '../../../db/knexClient.js';
// import type { ApiResponse } from '../../../core/types/api.types.js';
// import { errorResponse, successResponse } from '../../../shared/utils/response.utils.js';
// import { logger, logError } from '../../../shared/utils/logger.js';
// import { providerRegistry } from '../providers/registry.js';
// import { getDecryptedToken } from '../../../domains/banking/banking.model.js';
// import { createNewBankAccount } from '../../../domains/bankAccounts/bankAccounts.model.js';
// import { getAccountTypeByKey } from '../../../domains/account/account.registry.js';
// import type { NewBankAccountInput } from '../../../domains/bankAccounts/bankAccounts.types.js';
// import type {
//   AccountDiscoveryResult,
//   ProviderInstitution,
//   ProviderAccount
// } from '../types/base.js';

// export interface SyncAccountsParams {
//   credentialId: string;
//   options?: {
//     forceResync?: boolean;
//     includeFullAccountNumber?: boolean;
//   };
// }

// export interface SyncResult {
//   success: boolean;
//   credentialId: string;
//   institutionId?: string;
//   accountsSynced: number;
//   connectionsCreated: number;
//   errors?: string[];
//   data?: {
//     bankId?: string;
//     accountIds: string[];
//     connectionIds: string[];
//   };
// }

// export class AccountSyncService {
//   constructor(private knex: Knex = knexClient) {}

//   /**
//    * Main orchestration method for syncing accounts after connection
//    */
//   async syncAccountsAfterConnection(params: SyncAccountsParams): Promise<SyncResult> {
//     const { credentialId, options = {} } = params;

//     logger.info(
//       { credentialId, options },
//       'Starting account sync after connection'
//     );

//     try {
//       // 1. Get credential details and decrypt token
//       const credential = await this.getCredentialWithToken(credentialId);
//       if (!credential.success || !credential.data) {
//         throw new Error(`Failed to get credential: ${credential.error}`);
//       }

//       const { providerKey, token, companyId, providerId } = credential.data;

//       // 2. Get provider instance
//       const provider = await providerRegistry.get(providerKey);
//       if (!provider) {
//         throw new Error(`Provider ${providerKey} not found`);
//       }

//       // 3. Discover accounts from provider
//       const discoveryResult = await provider.discoverAccounts({
//         accessToken: token,
//         metadata: options
//       });

//       logger.info(
//         {
//           credentialId,
//           itemId: discoveryResult.item.itemId,
//           institutionId: discoveryResult.institution.institutionId,
//           accountCount: discoveryResult.accounts.length
//         },
//         'Successfully discovered accounts from provider'
//       );

//       // 4. Process in transaction for atomicity
//       const syncResult = await this.knex.transaction(async (trx) => {
//         // Ensure institution exists
//         const bankId = await this.ensureInstitution({
//           institution: discoveryResult.institution,
//           providerId,
//           trx
//         });

//         // Create bank accounts
//         const accountIds = await this.createBankAccounts({
//           accounts: discoveryResult.accounts,
//           bankId,
//           companyId,
//           credentialId,
//           trx
//         });

//         // Create connections
//         const connectionIds = await this.createBankAccountConnections({
//           accounts: discoveryResult.accounts,
//           accountIds,
//           providerId,
//           credentialId,
//           trx
//         });

//         return {
//           bankId,
//           accountIds,
//           connectionIds
//         };
//       });

//       logger.info(
//         {
//           credentialId,
//           bankId: syncResult.bankId,
//           accountsSynced: syncResult.accountIds.length,
//           connectionsCreated: syncResult.connectionIds.length
//         },
//         'Account sync completed successfully'
//       );

//       return {
//         success: true,
//         credentialId,
//         institutionId: discoveryResult.institution.institutionId,
//         accountsSynced: syncResult.accountIds.length,
//         connectionsCreated: syncResult.connectionIds.length,
//         data: syncResult
//       };

//     } catch (error: any) {
//       logError(error, { credentialId, operation: 'syncAccountsAfterConnection' });

//       // Create orphaned connections for debugging
//       await this.createOrphanedConnections({
//         credentialId,
//         error,
//         metadata: options
//       });

//       return {
//         success: false,
//         credentialId,
//         accountsSynced: 0,
//         connectionsCreated: 0,
//         errors: [error.message]
//       };
//     }
//   }

//   /**
//    * Get credential details and decrypt token
//    */
//   private async getCredentialWithToken(credentialId: string): Promise<ApiResponse<{
//     providerKey: string;
//     token: string;
//     companyId: string;
//     providerId: string;
//   }>> {
//     try {
//       const credential = await this.knex('company_bank_credentials as cbc')
//         .join('bank_feed_providers as bfp', 'cbc.provider_id', 'bfp.id')
//         .where('cbc.id', credentialId)
//         .where('cbc.status', 'active')
//         .select(
//           'cbc.company_id',
//           'cbc.provider_id',
//           'cbc.encrypted_token',
//           'bfp.key as provider_key'
//         )
//         .first();

//       if (!credential) {
//         return errorResponse('Credential not found or inactive');
//       }

//       // Decrypt token
//       const tokenResult = await getDecryptedToken({
//         companyId: credential.company_id,
//         providerKey: credential.provider_key
//       });

//       if (!tokenResult.success || !tokenResult.token) {
//         return errorResponse('Failed to decrypt token');
//       }

//       return successResponse('Credential retrieved', {
//         providerKey: credential.provider_key,
//         token: tokenResult.token,
//         companyId: credential.company_id,
//         providerId: credential.provider_id
//       });

//     } catch (error: any) {
//       logError(error, { credentialId, operation: 'getCredentialWithToken' });
//       return errorResponse('Failed to get credential');
//     }
//   }

//   /**
//    * Ensure institution exists in our banks table, checking provider mappings first
//    */
//   private async ensureInstitution(params: {
//     institution: ProviderInstitution;
//     providerId: string;
//     trx: Knex.Transaction;
//   }): Promise<string> {
//     const { institution, providerId, trx } = params;

//     // 1. Check if mapping already exists
//     const existingMapping = await trx('bank_provider_mappings')
//       .where({
//         provider_id: providerId,
//         provider_bank_id: institution.institutionId
//       })
//       .first('bank_id');

//     if (existingMapping) {
//       logger.debug(
//         {
//           institutionId: institution.institutionId,
//           bankId: existingMapping.bank_id
//         },
//         'Found existing institution mapping'
//       );
//       return existingMapping.bank_id;
//     }

//     // 2. Create new bank if mapping doesn't exist
//     return await this.createInstitutionWithMapping({
//       institution,
//       providerId,
//       trx
//     });
//   }

//   /**
//    * Create new institution and mapping
//    */
//   private async createInstitutionWithMapping(params: {
//     institution: ProviderInstitution;
//     providerId: string;
//     trx: Knex.Transaction;
//   }): Promise<string> {
//     const { institution, providerId, trx } = params;

//     // Get system user ID (or use the credential creator)
//     const systemUserId = await this.getSystemUserId(trx);

//     // Determine country
//     const country = await trx('countries')
//       .where('code', institution.countryCode || 'US')
//       .first('id');

//     if (!country) {
//       throw new Error(`Country not found: ${institution.countryCode}`);
//     }

//     // Create bank record with improved key generation
//     const [bank] = await trx('banks')
//       .insert({
//         key: this.generateBankKey(institution.name, institution.countryCode || 'US'),
//         display_name: institution.name,
//         official_name: institution.name,
//         website: institution.url,
//         logo_url: institution.logo,
//         country_id: country.id,
//         local_code: institution.codes?.local,
//         swift_code: institution.codes?.swift,
//         created_by_id: systemUserId,
//         updated_by_id: systemUserId
//       })
//       .returning('id');

//     // Create provider mapping
//     await trx('bank_provider_mappings')
//       .insert({
//         provider_id: providerId,
//         bank_id: bank.id,
//         provider_bank_id: institution.institutionId,
//         provider_bank_name: institution.name,
//         raw_provider_data: institution.rawData,
//         created_by_id: systemUserId,
//         updated_by_id: systemUserId
//       });

//     logger.info(
//       {
//         institutionId: institution.institutionId,
//         bankId: bank.id,
//         name: institution.name
//       },
//       'Created new institution and mapping'
//     );

//     return bank.id;
//   }

//   /**
//    * Create bank account records using existing createNewBankAccount function
//    */
//   private async createBankAccounts(params: {
//     accounts: ProviderAccount[];
//     bankId: string;
//     companyId: string;
//     credentialId: string;
//     trx: Knex.Transaction;
//   }): Promise<string[]> {
//     const { accounts, bankId, companyId, credentialId, trx } = params;

//     const systemUserId = await this.getSystemUserId(trx);
//     const accountIds: string[] = [];
//     const errors: string[] = [];

//     // Process each account individually to handle duplicates gracefully
//     for (const account of accounts) {
//       try {
//         // Check for existing account to ensure idempotency
//         const existingAccount = await trx('bank_accounts')
//           .where({
//             company_id: companyId,
//             bank_id: bankId,
//             account_number: account.mask || account.accountId.slice(-4)
//           })
//           .first('id');

//         if (existingAccount) {
//           logger.debug(
//             {
//               accountId: account.accountId,
//               existingBankAccountId: existingAccount.id,
//               credentialId
//             },
//             'Reusing existing bank account'
//           );
//           accountIds.push(existingAccount.id);
//           continue;
//         }

//         // Get account currency
//         const currency = await this.getAccountCurrency(account.currency, trx);

//         // Prepare input for createNewBankAccount
//         const bankAccountInput: NewBankAccountInput = {
//           displayName: account.name,
//           accountName: account.officialName || account.name,
//           accountType: this.mapAccountType(account.type),
//           businessOrPersonal: account.holderType === 'business' ? 'business' :
//                             account.holderType === 'personal' ? 'personal' : undefined,
//           accountNumber: account.mask || account.accountId.slice(-4),
//           bankId: bankId,
//           currencyId: currency.id,
//           source: 'integration' // Mark as coming from integration
//         };

//         // Use existing createNewBankAccount function
//         const result = await createNewBankAccount({
//           companyId,
//           userId: systemUserId,
//           data: bankAccountInput,
//           trx
//         });

//         if (!result.success || !result.data) {
//           errors.push(`Failed to create account ${account.name}: ${result.error}`);
//           continue;
//         }

//         accountIds.push(result.data.id);

//         logger.debug(
//           {
//             providerAccountId: account.accountId,
//             bankAccountId: result.data.id,
//             name: account.name,
//             credentialId
//           },
//           'Created bank account successfully'
//         );

//       } catch (error: any) {
//         const errorMsg = `Failed to process account ${account.name}: ${error.message}`;
//         errors.push(errorMsg);
//         logError(error, {
//           credentialId,
//           accountId: account.accountId,
//           operation: 'createBankAccount'
//         });
//       }
//     }

//     if (errors.length > 0) {
//       logger.warn(
//         { credentialId, errors, successCount: accountIds.length },
//         'Some accounts failed to create'
//       );
//     } else {
//       logger.info(
//         { credentialId, bankId, accountCount: accountIds.length },
//         'Created bank account records'
//       );
//     }

//     return accountIds;
//   }

//   /**
//    * Create bank account connections with idempotency
//    */
//   private async createBankAccountConnections(params: {
//     accounts: ProviderAccount[];
//     accountIds: string[];
//     providerId: string;
//     credentialId: string;
//     trx: Knex.Transaction;
//   }): Promise<string[]> {
//     const { accounts, accountIds, providerId, credentialId, trx } = params;

//     const systemUserId = await this.getSystemUserId(trx);
//     const connectionIds: string[] = [];

//     for (let i = 0; i < accounts.length; i++) {
//       const account = accounts[i];
//       const bankAccountId = accountIds[i];

//       if (!bankAccountId) continue; // Skip if bank account creation failed

//       try {
//         // Check for existing connection (idempotency)
//         const existingConnection = await trx('bank_account_connections')
//           .where({
//             provider_id: providerId,
//             provider_bank_account_id: account.accountId
//           })
//           .first('id');

//         if (existingConnection) {
//           logger.debug(
//             {
//               providerAccountId: account.accountId,
//               existingConnectionId: existingConnection.id,
//               credentialId
//             },
//             'Reusing existing bank account connection'
//           );
//           connectionIds.push(existingConnection.id);
//           continue;
//         }

//         // Create new connection
//         const connectionRecord = {
//           provider_bank_account_id: account.accountId,
//           provider_bank_account_secondary_id: account.mask || null,
//           bank_account_id: bankAccountId,
//           provider_id: providerId,
//           status: 'active',
//           raw_metadata: {
//             credential_id: credentialId,
//             account_summary: this.sanitizeAccountDataForLogging(account),
//             synced_at: new Date()
//           },
//           connected_at: new Date(),
//           created_by_id: systemUserId
//         };

//         const [connection] = await trx('bank_account_connections')
//           .insert(connectionRecord)
//           .returning('id')
//           .catch((error: any) => {
//             // Handle duplicate key constraint (23505)
//             if (error.code === '23505') {
//               logger.debug(
//                 {
//                   providerAccountId: account.accountId,
//                   credentialId,
//                   error: 'Duplicate connection detected'
//                 },
//                 'Connection already exists, fetching existing'
//               );
//               return trx('bank_account_connections')
//                 .where({
//                   provider_id: providerId,
//                   provider_bank_account_id: account.accountId
//                 })
//                 .select('id')
//                 .limit(1);
//             }
//             throw error;
//           });

//         if (connection?.id) {
//           connectionIds.push(connection.id);
//         }

//       } catch (error: any) {
//         logError(error, {
//           credentialId,
//           providerAccountId: account.accountId,
//           operation: 'createBankAccountConnection'
//         });
//         // Continue processing other connections
//       }
//     }

//     logger.info(
//       { credentialId, connectionCount: connectionIds.length },
//       'Created bank account connections'
//     );

//     return connectionIds;
//   }

//   /**
//    * Create orphaned connections for debugging failed syncs
//    */
//   private async createOrphanedConnections(params: {
//     credentialId: string;
//     error: Error;
//     metadata?: Record<string, any>;
//   }): Promise<void> {
//     try {
//       const { credentialId, error, metadata } = params;

//       // Get basic credential info
//       const credential = await this.knex('company_bank_credentials as cbc')
//         .join('bank_feed_providers as bfp', 'cbc.provider_id', 'bfp.id')
//         .where('cbc.id', credentialId)
//         .select('cbc.provider_id', 'bfp.key as provider_key')
//         .first();

//       if (!credential) return;

//       const systemUserId = await this.getSystemUserId();

//       await this.knex('bank_account_connections')
//         .insert({
//           provider_bank_account_id: 'sync_failed',
//           provider_bank_account_secondary_id: null,
//           bank_account_id: null, // NULL indicates sync failure
//           provider_id: credential.provider_id,
//           status: 'error',
//           raw_metadata: {
//             error: error.message,
//             stack: error.stack,
//             credential_id: credentialId,
//             sync_attempt: new Date(),
//             options: metadata
//           },
//           connected_at: new Date(),
//           created_by_id: systemUserId
//         });

//       logger.warn(
//         { credentialId, error: error.message },
//         'Created orphaned connection for debugging'
//       );

//     } catch (orphanError: any) {
//       logError(orphanError, {
//         credentialId,
//         originalError: error.message,
//         operation: 'createOrphanedConnections'
//       });
//     }
//   }

//   /**
//    * Get account currency, fallback to company's reporting currency
//    */
//   private async getAccountCurrency(currencyCode?: string, trx?: Knex.Transaction): Promise<{ id: string; code: string }> {
//     const executor = trx || this.knex;

//     // Try to get the specific currency first
//     if (currencyCode) {
//       const currency = await executor('currencies')
//         .where('code', currencyCode.toUpperCase())
//         .first('id', 'code');

//       if (currency) {
//         return currency;
//       }
//     }

//     // Fallback to USD as default
//     const defaultCurrency = await executor('currencies')
//       .where('code', 'USD')
//       .first('id', 'code');

//     if (!defaultCurrency) {
//       throw new Error('No default currency (USD) found in database');
//     }

//     return defaultCurrency;
//   }

//   /**
//    * Map provider account types to our bank_account_type enum
//    */
//   private mapAccountType(providerType: string): 'other' | 'credit_card' | 'debit_card' | 'savings' | 'checkings_current' | 'utility' {
//     const typeMap: Record<string, 'other' | 'credit_card' | 'debit_card' | 'savings' | 'checkings_current' | 'utility'> = {
//       'checking': 'checkings_current',
//       'checkings': 'checkings_current',
//       'current': 'checkings_current',
//       'savings': 'savings',
//       'credit': 'credit_card',
//       'credit_card': 'credit_card',
//       'depository': 'checkings_current',
//       'loan': 'other',
//       'investment': 'other',
//       'utility': 'utility',
//       'other': 'other'
//     };

//     const normalized = providerType.toLowerCase().replace(/[^a-z]/g, '');
//     return typeMap[normalized] || 'other';
//   }

//   /**
//    * Generate a readable and stable bank key
//    */
//   private generateBankKey(institutionName: string, countryCode: string): string {
//     const slugify = (text: string): string => {
//       return text
//         .toLowerCase()
//         .trim()
//         .replace(/[^\w\s-]/g, '') // Remove special characters
//         .replace(/[\s_-]+/g, '_') // Replace spaces/dashes with underscores
//         .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
//     };

//     const slug = slugify(institutionName);
//     const cc = countryCode.toLowerCase();

//     // Ensure reasonable length (max 50 characters for bank key)
//     const maxSlugLength = 50 - cc.length - 1; // Account for cc_ prefix
//     const truncatedSlug = slug.length > maxSlugLength ? slug.substring(0, maxSlugLength) : slug;

//     return `${cc}_${truncatedSlug}`;
//   }

//   /**
//    * Sanitize account data for logging (remove sensitive information)
//    */
//   private sanitizeAccountDataForLogging(account: ProviderAccount): Partial<ProviderAccount> {
//     return {
//       accountId: account.accountId,
//       name: account.name,
//       type: account.type,
//       subtype: account.subtype,
//       mask: account.mask,
//       currency: account.currency,
//       holderType: account.holderType,
//       status: account.status,
//       // Exclude rawData, accountNumber, and balance for security
//     };
//   }

//   /**
//    * Get system user ID for operations
//    */
//   private async getSystemUserId(trx?: Knex.Transaction): Promise<string> {
//     const query = (trx || this.knex)('users')
//       .where('email', 'system@accountable.com')
//       .orWhere('email', 'admin@accountable.com')
//       .first('id');

//     const systemUser = await query;

//     if (!systemUser) {
//       throw new Error('System user not found');
//     }

//     return systemUser.id;
//   }
// }

// // Export singleton instance
// export const accountSyncService = new AccountSyncService();
