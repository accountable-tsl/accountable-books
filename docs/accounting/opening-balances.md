# How Opening Balances (Bank) Work in Our System

_Dead simple — no jargon, no heavy accounting talk_

## 1. The Big Picture

There are two worlds in our app as it concerns opening balances, depending on whether the company has set a conversion date:

### Flexible Mode (no conversion date yet)

- **Example Users**: A new business connecting their bank for the first time
- **Goal**: Let them fix balances easily — system auto-adjusts

### Accounting Mode (conversion date set)

- **Example Users**: A firm that has officially set their conversion balances for all accounts (a feature we'll provide in v2)
- **Goal**: Freeze history — protect financial accuracy

We switch between these two automatically based on whether the `company.conversion_date` is set.

## 2. What Happens When a Bank Account Is First Connected

When a user connects a bank account, we fetch:

- The account's current balance (from provider)
- The list of transactions (e.g. last 30 or 90 days)

We use that info to figure out what the balance must have been before those transactions started.

### Example:

**Provider says:**

- Transactions from Oct 1 → Oct 30
- Latest balance (Oct 30): ₦3,000
- Sum of all transactions = −2,000
  - Or the first transaction on Oct 1 was 1000, bal 6000, balance is post txn
  - That means the account must have had ₦5,000 at the end of Sep 30.

**So we:**

1. Create a bank opening balance record for Sep 30 = ₦5,000
2. Post a journal entry (JE) for the GL:
   - Dr Bank ₦5,000
   - Cr Equity account say "Opening Balance Equity" ₦5,000
3. Enqueue a bank balance calculation job that creates daily snapshot using this opening balance record as the starting point. This first opening balance is used in computing current balance (but never again)

That's it — we've now established the starting point.

## 3. What Happens If the User Later Adds Older Transactions

Let's say the user uploads or syncs September data later:

- Sep 10: +₦11,000
- Sep 15: −₦8,000
- → Net change = +₦3,000

We recalculate:

- If the balance at Sep 30 was ₦5,000, then balance at Sep 9 must have been ₦2,000.
- Or using the Oct 30 close. Closing balance we used initially was ₦3,000 on Oct 30
  - Sum of all known transactions (Sep + Oct) = +1,000
  - New implied opening = ₦3,000 − 1,000 = ₦2,000
  - So the new earliest known truth is ₦2,000 as of Sep 9.

## 4. How the System Updates

We add the new opening balance of 2000 to the bank opening balance record

Now the behavior depends on conversion mode:

### Conversion date set (locked mode)

- We do not touch the GL at all — it's frozen.
- We can still record the new anchor in the bank opening balance table (for completeness), but it's not posted.
- In many cases, this backfill might even be blocked entirely.

### No conversion date (flex mode)

- We void the old JE (₦5,000) and post a new one for ₦2,000. GL now matches the new truth.
  (Technically, this means creating a new journal batch that produces one ledger transaction and its ledger entries.)
- Recalculate daily snapshots only for the affected window (Sep 9–Sep 30) — but only after confirming that the new timeline still leads to the same closing balance (₦5,000 on Sep 30, or ₦3,000 at Oct 30).
  “Confirming nothing’s off” means checking that the closing balance on the last txn of Sep 30 matches the next anchor.
- Do not touch the current balance. It's already correct.
  Backfilled transactions just explain how we got here — they're not extra movement.

## 5. Audit Trail (so we never lose track)

Each time an opening balance is replaced:

- The old record is kept but marked as voided/superseded.
- A new record is created (status = active).
- A note explains the reason (e.g. "Originally ₦5,000 on Sep 30 → updated to ₦2,000 on Sep 9 due to older transactions entered Sept 10 - 15").
- We can link both old and new journal somehow with an id or something (perhaps we need to add a field to journal batch)

## 6. Edge case - Overlaps

Sometimes a new batch includes a transaction that overlaps with an existing window (e.g. second batch includes a transaction on a time the old period already covered (e.g., Oct 1, 02:00))

**What to do (Flex mode):**

- Recompute the opening amount using the expanded window.
- Add a delta entry with the same timestamp as the previous opening (₦5,000) in bank opening balances table, then the prior opening JE and post a new one — so the GL reflects the adjustment cleanly.
- Recompute snapshots from the new earliest transaction through the date of the overlap, in this case (Oct 1).
- (Optional idea) To minimize overlaps, we can store the opening balance timestamp as one second before the earliest transaction in the window — but overlaps can still happen, and that's fine as long as providers include timestamps.

## 7. TL;DR Summary

- **Before conversion** → flex freely.
  - System adjusts, replaces JEs, recomputes affected periods.

- **After conversion** → freeze history.
  - Record new anchors only for tracking, not posting.

- **Current balances** → never touched.
  - They're always the provider truth.

- **Overlaps** → expand the window and rebuild.
  - The system keeps everything consistent automatically.
