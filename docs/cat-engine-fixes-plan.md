# Cat Engine Fixes Plan

Date: 2026-01-27
Owner: Codex + Tami

## Scope

This document covers the issues raised for Cat Engine (active path: TransactionViewV2) and related data fetching. It records the problems, approaches considered, tradeoffs, and recommended direction.

## 1) In-flight autosave updates can be dropped

### Problem

`sendPendingChanges` returns early if a request is in-flight, and does not queue a follow-up. Edits made during the in-flight period can remain in `desiredState` without a new send unless the user edits again after the request finishes.

### Options

1. **Per-transaction resend flag (recommended)**
   - If in-flight, set `needsResend` for that transaction and return.
   - On completion, check flag and immediately call `sendPendingChanges` again.
2. **Global queue of pending transactions**
   - Maintain a queue and process sequentially with backpressure.
   - More complex, slightly higher maintenance.
3. **Allow concurrent in-flight requests**
   - Skip the guard and rely on the backend to resolve conflicts.
   - Risky with ordering and possible stale writes.

### Tradeoffs

- Option 1 is minimal, easy to reason about, and preserves current autosave UX.
- Option 2 is robust but adds complexity and potential ordering edge cases.
- Option 3 risks data races and inconsistent UI/DB state.

### Recommendation

**Option 1** (per-transaction resend flag). It is the smallest change that fully fixes the drop risk.

---

## 2) Draft-only UI edits can leak into saved intents

### Problem

`TransactionViewV2` directly mutates entries returned from `getEntriesUI()` in `updateEntryDraft`. These entry objects are later used as the base when building intents. This means draft edits (including ones the user cancels) can unintentionally be persisted when a different field is saved or autosaved.

### Options

1. **Keep drafts in local component state (recommended)**
   - Treat `entriesUI` as immutable display data.
   - Maintain a `draftEntries` map in the component.
   - On save or autosave, call `updateEntry(entryId, patch)`.
2. **Clone entries on read**
   - Ensure the manager returns a deep copy of entries for editing.
   - Prevents accidental mutation, but requires more copying and careful memoization.
3. **Manager-level draft tracking**
   - Extend intent manager to support draft entries explicitly.
   - Larger change, spreads UI concerns into domain logic.

### Tradeoffs

- Option 1 keeps domain layer clean and makes draft state explicit, but requires additional UI state management.
- Option 2 is simpler in UI but might introduce performance overhead and stale merges.
- Option 3 is the most complex and not needed for the current UX.

### Recommendation

**Option 1** (local draft state). It aligns with the current component ownership of edit UX and avoids hidden side effects.

---

## 3) File uploads can duplicate in autosave

### Problem

Autosave can re-run while uploads are still in-flight. Files are only marked saved after mutation resolves, so the same files can be uploaded multiple times.

### Options

1. **Track `uploadingFiles` set (recommended)**
   - Key: `entryId:fileName:fileSize`.
   - Before upload, mark as uploading; skip any file already in `savedFiles` or `uploadingFiles`.
   - On success: move to saved; on failure: remove from uploading.
2. **Backend de-duplication**
   - Ensure idempotency server-side.
   - Good long-term, but still wastes client bandwidth and doesn’t stop UI retries.
3. **Disable autosave for files**
   - Force explicit upload action.
   - Avoids duplicates but worsens UX.

### Tradeoffs

- Option 1 is low-risk, keeps UX intact, and prevents duplicates client-side.
- Option 2 is robust but requires server work and does not solve client retries.
- Option 3 changes UX and reduces convenience.

### Recommendation

**Option 1** (uploadingFiles set) with optional future backend idempotency.

---

## 4) Blob URL memory leak when removing files

### Problem

Blob URLs are only revoked on component unmount. When a file is removed from draft state, its blob URL remains in memory.

### Options

1. **Revoke blob URL on removal (recommended)**
   - When a file is removed, immediately revoke and delete from `blobUrls`.
2. **Periodic cleanup pass**
   - Diff current file list vs blobUrl map and revoke any orphans.
   - More complex and runs repeatedly.

### Tradeoffs

- Option 1 is straightforward and deterministic.
- Option 2 adds runtime overhead.

### Recommendation

**Option 1** (revoke on removal).

---

## 5) React Query error: “Query data cannot be undefined” (companyDetails)

### Observation

Log: `Query data cannot be undefined... Affected query key: ["companyDetails","firmDemoNG"]`.

### Likely causes

- `getCompanyDetails(companyId)` returns `undefined` for some error path or empty response.
- Axios interceptor might be swallowing errors and returning undefined.
- Unhandled network error path with no explicit return.

### Options

1. **Guard in queryFn (recommended)**
   - Ensure `queryFn` never returns `undefined`.
   - If API response is missing, throw an error or return a safe object.
2. **Fix at API client/interceptor layer**
   - Ensure `api.get` always throws on error or returns a defined object.
3. **Provide `placeholderData`**
   - Band-aid; does not address root cause and can hide real failures.

### Tradeoffs

- Option 1 is quick and localized, but might mask upstream errors if not accompanied by logging.
- Option 2 is more correct, but requires auditing interceptors.
- Option 3 should not be relied on.

### Recommendation

**Option 1 now**, followed by **Option 2** if logs indicate frequent undefined responses.

---

## Implementation order (suggested)

1. In-flight resend flag in intent manager.
2. File upload de-dup + blob URL revoke on removal.
3. Draft state refactor in TransactionViewV2.
4. Query undefined guard / logging for companyDetails.
