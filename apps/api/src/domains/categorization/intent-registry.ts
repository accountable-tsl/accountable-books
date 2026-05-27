import type {
  DataMutationIntent,
  Intent,
} from '@accountable-books/contracts/schema';

import type {
  LedgerEntryInput,
  NewLedgerTransactionData,
  UpdateOrCreateLedgerInput,
} from '../ledgers/ledgers.types.js';

// Each intent means "change this field to this value" or sometimes "do x"
// Before we process intents, we'll use LedgerAccumulator to collect changes
type LedgerAccumulator = {
  transaction: Partial<Omit<UpdateOrCreateLedgerInput, 'transactions'>>;
  entries: Map<string, Partial<LedgerEntryInput>>;
};

type IntentHandler<T extends DataMutationIntent> = (
  acc: LedgerAccumulator,
  intent: Intent<T>,
) => void;

// // We'll do something like this once when building the accumulator
// function createAccumulator(intent: Intent): LedgerAccumulator {
//   return {
//     transaction: {
//       source_transaction_id: intent.bank_transaction_id,
//       transaction_source: 'bank_transaction',
//     },
//     entries: new Map(),
//   };
// }

const intentHandlers: {
  [K in DataMutationIntent]: IntentHandler<K>;
} = {
  ASSIGN_COA: handleAssignCoa,
  UPDATE_DESCRIPTION: handleUpdateDescription,
  UPDATE_FS_DATE: handleUpdateFsDate,
  UPDATE_CONTACT: handleUpdateContact,
  UPDATE_REFERENCE: handleUpdateReference,
  UPDATE_PROJECT: handleUpdateProject,
  // POST_TO_LEDGER: handlePostToLedger,
};

function handleAssignCoa(acc: LedgerAccumulator, intent: Intent<'ASSIGN_COA'>) {
  // Only at entry level
  const { entryId, coaId } = intent.payload;
  const entry = acc.entries.get(entryId) ?? { id: entryId }; // Find entry bucket, if it doesn't exist, create it
  entry.coa_id = coaId; // Write the
  acc.entries.set(entryId, entry);
}

function handleUpdateDescription(
  acc: LedgerAccumulator,
  intent: Intent<'UPDATE_DESCRIPTION'>,
) {
  const { scope, entryId, value } = intent.payload;

  if (scope === 'group') {
    acc.transaction.description = value;
    return;
  }

  if (!entryId) return;
  const entry = acc.entries.get(entryId) ?? { id: entryId };
  entry.description = value;
  acc.entries.set(entryId, entry);
}

function handleUpdateFsDate(
  acc: LedgerAccumulator,
  intent: Intent<'UPDATE_FS_DATE'>,
) {
  const { entryId, fsDate } = intent.payload;
  if (!entryId) return;
  const entry = acc.entries.get(entryId) ?? { id: entryId };
  entry.fs_date = fsDate;
  acc.entries.set(entryId, entry);
}

function handleUpdateContact(
  acc: LedgerAccumulator,
  intent: Intent<'UPDATE_CONTACT'>,
) {
  const { entryId, contactId, contactType } = intent.payload;

  // I guess we should keep contact changes at entry level. Transaction level maintains contact from the bank transaction

  if (!entryId) return;
  const entry = acc.entries.get(entryId) ?? { id: entryId };
  entry.contact_id = contactId;
  entry.contact_type = contactType;
  acc.entries.set(entryId, entry);
}

function handleUpdateReference(
  acc: LedgerAccumulator,
  intent: Intent<'UPDATE_REFERENCE'>,
) {
  const { scope, entryId, reference } = intent.payload;

  if (scope === 'group') {
    acc.transaction.reference = reference;
    return;
  }

  // If user adds different references to entries for the same bank transaction, it'll probably come in with a split, and if so, we should be having more than one transaction I suppose
}

function handleUpdateProject(
  acc: LedgerAccumulator,
  intent: Intent<'UPDATE_PROJECT'>,
) {
  const { entryId, projectId } = intent.payload;
  if (!entryId) return;
  const entry = acc.entries.get(entryId) ?? { id: entryId };
  entry.project_id = projectId;
  acc.entries.set(entryId, entry);
}

function handleUpdateFxRate(
  acc: LedgerAccumulator,
  intent: Intent<'UPDATE_FX_RATE'>,
) {
  const { bankTransactionId, rate } = intent.payload;
  // Any update to exchange rate will affect every entry that uses that bankTransactionId, I guess we might have to handle this outside of this registry as well
}

function handlePostToLedger(
  acc: LedgerAccumulator,
  intent: Intent<'POST_TO_LEDGER'>,
) {
  const { bankTransactionId } = intent.payload;
  // Not sure what to do here... more like an action
}

function handleSplitTransaction(
  acc: LedgerAccumulator,
  intent: Intent<'SPLIT_TRANSACTION'>,
) {
  const { entries } = intent.payload;

  // Entries might not yet exist, not sure how to handle this here
}
