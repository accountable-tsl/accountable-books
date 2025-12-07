# Accounting Flow & Ledger Mutation Model

This document defines how a single transaction moves through the system and how user edits are persisted without drafts or ambiguity.

---

# 1. System Overview

Every transaction in the product lives in one of three real states:

1. **Unresolved**
   - A bank transaction exists, but rules/ML didn’t produce a valid double-entry.
   - No candidate. No ledger entry yet.

2. **Candidate**
   - Rules or ML resolved the transaction and produced a suggested double-entry.
   - Stored in `categorization_candidates` + `categorization_candidate_lines`.
   - This represents a _suggestion_, not the books.
   - Direct results from ML or rules are stored in `categorization_predictions` + `categorization_prediction_lines`

3. **Posted**
   - A valid journal (double-entry) is written to the ledger.
   - This becomes the **source of truth**.

Users interact with a **single unified table** that displays a mix of these states.

---

# 2. How a Transaction Moves Through the System

## 2.1. Raw Input → AI/Rules

1. Bank transaction arrives.
2. Rule engine attempts to resolve.
3. ML (shadow or primary) attempts to resolve.
4. If solver checks pass → **create candidate**.
5. If user settings allow auto-post → candidate is immediately posted to ledger.

---

## 2.2. UI: Mixed Table

User sees:

- Unresolved bank transactions
- Candidate-backed transactions
- Auto-posted but unreviewed ledger entries
- (optional) Posted + reviewed entries

Everything looks like one consistent list. No bank legs shown.

---

# 3. When Users Edit

The moment a user edits **anything**, the system must persist it properly.

**Key rule:**  
User edits affect the **ledger**, not the candidate.  
Candidates remain as historical AI/solver output only.
User edits to unresolved bank transactions are not persisted (if they do not include chart of account selection)

Different actions have different effects:

---

# 4. Types of Edits

## A. Non-Accounting Edits (Update in place)

These do _not_ change financial meaning:

- description
- reference
- memo
- contact
- tags
- attachments
- internal metadata

**Behavior:**

- Update the existing ledger entry directly.
- Log change in `ledger_change_log` as metadata update.
- No new version. No new lines.

This avoids version bloat (e.g., 5 autosaves while typing a description).

---

## B. Accounting Edits (Create new version)

These _do_ change financial meaning:

- COA account change
- Posting date change across periods
- Any debit/credit amount change
- Splitting or merging lines
- Tax code changes
- Project/class changes (if used in reporting)
- Any structural change to double-entry

**Behavior:**

1. Mark old ledger lines as `superseded` or set deleted true or both, _(decide this later)_
2. Insert new ledger lines
3. Record full diff
4. UI displays only the active version

This preserves immutability where it matters.

---

# 5. Special Case: Unresolved → User Picks Account

When user manually selects an account for an unresolved transaction:

1. Validate (period open, amounts consistent with bank, etc.)
2. Create first ledger entry
3. Log
4. This transaction now lives in the “Posted” state
5. Render active ledger entry in UI

Candidates are skipped entirely for this path.

---

# 6. Special Case: Candidate → User Edits

When user changes a candidate (contact, description, account, etc.):

- Changes do **not** go back to candidates
- They produce a **new ledger entry** (first posting)
- Candidates remain frozen as the machine’s suggestion
- Ledger becomes the truth thereafter

---

# 7. Auto-Posting

If confidence or rules allow auto-post:

1. Candidate → Ledger immediately
2. Mark as `auto_categorized`, `human_reviewed = false`
3. User edits (if any) follow the ledger rules above

---

# 8. Period Lock Behavior

- If period is **locked**:
  - Reject accounting edits
  - Only allow safe metadata edits (configurable)
  - UI should even grey out the transaction and add a lock icon and message

- If period is **open**:
  - Allow edits freely
  - Accounting changes → new version
  - Metadata changes → update in place

---
