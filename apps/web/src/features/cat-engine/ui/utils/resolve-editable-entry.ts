import type { GroupedTransaction } from '@/modules/accounting/categorization';
import type { EntryUI } from '@/modules/accounting/categorization/model/use-ledger-intent-manager-v2';

type AddEntry = (defaults?: Partial<EntryUI>) => string;

export function resolveEditableEntryId(
  txn: GroupedTransaction,
  addEntry: AddEntry,
  entriesUI?: EntryUI[],
): string | null {
  if (txn.rowType === 'subRow') {
    return txn.id;
  }

  if (txn.hasMultipleEntries) {
    return null;
  }

  if (entriesUI && entriesUI.length === 1) {
    return entriesUI[0].uiEntryId;
  }

  const existingEntryId = txn.entries?.[0]?.id;
  if (existingEntryId) {
    return existingEntryId;
  }

  if (txn.status !== 'uncategorized') {
    return null;
  }

  const sourceAmount = -txn.bankAmount;
  const fsDate = txn.fsDate ?? txn.date ?? null;

  return addEntry({
    coa_id: null,
    description: txn.description ?? null,
    reference: txn.reference ?? null,
    fs_date: fsDate,
    contact_id: txn.contactId ?? null,
    project_id: txn.projectId ?? null,
    source_amount: sourceAmount,
  });
}
