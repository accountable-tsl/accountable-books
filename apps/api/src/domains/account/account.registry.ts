import { getAccountClassificationMeta } from './account.model.js';
import {
  type AccountClassificationMetadata,
  type AccountElementDTO,
  type AccountTypeDTO,
  type FinancialStatementDTO,
} from './account.types.js';

interface AccountMetaCache extends AccountClassificationMetadata {
  accountTypesByKey: Map<string, AccountTypeDTO>;
  accountTypesById: Map<string, AccountTypeDTO>;
  accountElementsByKey: Map<string, AccountElementDTO>;
  accountElementsById: Map<string, AccountElementDTO>;
  financialStatementsByKey: Map<string, FinancialStatementDTO>;
  financialStatementsById: Map<string, FinancialStatementDTO>;
}

// In-memory cache for super fast access
export let accountMetaCache: AccountMetaCache | null = null;

/**
 * Creates indexed maps from the raw data for O(1) lookups
 */
function createIndexedMetadata(metadata: AccountClassificationMetadata): AccountMetaCache {
  const accountTypesByKey = new Map<string, AccountTypeDTO>();
  const accountTypesById = new Map<string, AccountTypeDTO>();

  metadata.accountTypes.forEach((dto) => {
    accountTypesByKey.set(dto.key, dto);
    if ('id' in dto && dto.id) {
      accountTypesById.set(dto.id.toString(), dto);
    }
  });

  const accountElementsByKey = new Map<string, AccountElementDTO>();
  const accountElementsById = new Map<string, AccountElementDTO>();

  metadata.accountElements.forEach((dto) => {
    accountElementsByKey.set(dto.key, dto);
    if ('id' in dto && dto.id) {
      accountElementsById.set(dto.id.toString(), dto);
    }
  });

  const financialStatementsByKey = new Map<string, FinancialStatementDTO>();
  const financialStatementsById = new Map<string, FinancialStatementDTO>();

  metadata.financialStatements.forEach((fs) => {
    financialStatementsByKey.set(fs.key, fs);
    if ('id' in fs && fs.id) {
      financialStatementsById.set(fs.id.toString(), fs);
    }
  });

  return {
    ...metadata,
    accountTypesByKey,
    accountTypesById,
    accountElementsByKey,
    accountElementsById,
    financialStatementsByKey,
    financialStatementsById,
  };
}

export async function loadAccountMeta(): Promise<void> {
  try {
    const metadata = await getAccountClassificationMeta({ includeIds: true });
    if (!metadata.success || !metadata.data)
      throw new Error('Failed to load account classification metadata');

    accountMetaCache = createIndexedMetadata(metadata.data);
  } catch (error) {
    throw new Error(
      'Failed to load account classification metadata: ' +
        (error instanceof Error ? error.message : 'Unknown error'),
    );
  }
}

/**
 * Invalidates the in-memory cache for account classification metadata.
 */
export function invalidateCoaInMemoryCache() {
  accountMetaCache = null;
}

let loadingPromise: Promise<void> | null = null;

async function ensureAccountMetaLoaded() {
  if (!accountMetaCache) {
    if (!loadingPromise) {
      loadingPromise = loadAccountMeta().finally(() => {
        loadingPromise = null;
      });
    }
    await loadingPromise;
  }
}

// Lookup functions
export async function getAccountTypeByKey(key: string): Promise<AccountTypeDTO | undefined> {
  await ensureAccountMetaLoaded();
  return accountMetaCache!.accountTypesByKey.get(key);
}

export async function getAccountTypeById(id: string): Promise<AccountTypeDTO | undefined> {
  await ensureAccountMetaLoaded();
  return accountMetaCache!.accountTypesById.get(id.toString());
}

export async function getAccountElementByKey(key: string): Promise<AccountElementDTO | undefined> {
  await ensureAccountMetaLoaded();
  return accountMetaCache!.accountElementsByKey.get(key);
}

export async function getAccountElementById(id: string): Promise<AccountElementDTO | undefined> {
  await ensureAccountMetaLoaded();
  return accountMetaCache!.accountElementsById.get(id.toString());
}

export async function getFinancialStatementByKey(
  key: string,
): Promise<FinancialStatementDTO | undefined> {
  await ensureAccountMetaLoaded();
  return accountMetaCache!.financialStatementsByKey.get(key);
}

export async function getFinancialStatementById(
  id: string,
): Promise<FinancialStatementDTO | undefined> {
  await ensureAccountMetaLoaded();
  return accountMetaCache!.financialStatementsById.get(id.toString());
}

export async function getFullAccountMeta(): Promise<AccountMetaCache> {
  await ensureAccountMetaLoaded();
  return accountMetaCache!;
}
