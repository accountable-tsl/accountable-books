# Journal Detail Pane — Production Readiness Audit & Fix Plan

## Context

[journal-detail-pane.tsx](apps/web/src/features/manage-journals/ui/components/journal-detail-pane.tsx) is a ~2,800-line component that handles many distinct product surfaces in one file:

- Standard journal view + edit flows (draft/posted/voided)
- New journal creation
- Recurring template viewing
- Recurring template creation (via the “Recurring Template” toggle on new journals)
- Attachments upload
- Keyboard shortcuts
- AI assist placeholders

It has accumulated significant technical debt: wrong endpoint wiring for recurring templates, duplicate keyboard shortcut handlers that fire simultaneously, missing dependencies causing stale saves, state leakage between selected journals, currency/timezone correctness issues, and hundreds of lines of near-identical code across mobile/desktop entry grids. This document categorizes the issues and proposes an execution order to fix them safely.

---

## Category 1: Critical Logic Bugs

### 1.1 Recurring journal creation calls the wrong mutation

- **Lines 1312–1335, 2596–2634, 2721–2791**: The UI switches into “template creation mode” when `isRecurringNew` is true (`isCreatingNew && recurringEnabled`) and labels primary actions as “Save Template”.
- **Lines 744–754, 796–814**: In that mode, `handleSave` and `handlePost` still call `createMutation.mutateAsync()` which creates a regular one-off journal. The UI says “Save Template” but the data goes to the normal `/journals` endpoint, not the recurring template endpoint.
- **Root cause**: The backend endpoint `POST /api/{companyId}/journals/templates` exists (in `apps/api/src/domains/journals/recurring-templates.model.ts:563-653`) but the frontend is missing both the API function and the React Query hook.
- **Fix**:
  1. Add `createRecurringTemplate` API function in [api/index.ts](apps/web/src/modules/accounting/journals/api/index.ts) — `POST /api/{companyId}/journals/templates` with body: `{ description, title, note, contactId, currencyId, frequency, startDateYMD, endDateYMD, autoPost, entries[] }`
  2. Add `useCreateRecurringTemplate` mutation hook in [model/hooks.ts](apps/web/src/modules/accounting/journals/model/hooks.ts) — with proper cache invalidation
  3. In `handleSave`: when `isRecurringNew`, call the new mutation instead of `createMutation`, mapping the current form state to the template input shape (notably: `date` → `startDateYMD`, `recurringFrequency` → `frequency`, etc.)
  4. When `isRecurringNew`, `handlePost` should not be callable — templates are activated via status change, not posted

### 1.2 Duplicate keyboard shortcut handlers

- **Lines 413–440** (effect #1): Registers `Cmd+S` → `handleSaveRef.current()` and `Cmd+Enter` → `setConfirmDialog('post')`.
- **Lines 937–963** (effect #2): Registers `Cmd+S` → `void handleSave()` and `Cmd+Enter` → `void handlePost()`.
- Both run simultaneously. This means every `Cmd+S` triggers two saves, and `Cmd+Enter` both opens the post dialog AND directly calls `handlePost()`.
- **Fix**: Remove effect #1 entirely. Effect #2 is the correct, complete implementation (it includes `isMobile` guard, has proper deps, calls the actual functions).

### 1.3 Missing dependencies in `payload` useMemo

- **Lines 522–573**: The `payload` object uses `description` (line 527), `reference` (line 524), and `contactId` (line 528), but these are missing from the dependency array (lines 561–573).
- **Impact**: If the user changes description, reference, or contact, then immediately hits save, the payload contains stale values.
- **Fix**: Add `description`, `reference`, and `contactId` to the dependency array.

### 1.4 Desktop debit/credit amount fields hide value on `0`

- **Lines 2253–2256**: `value={line.side === 'debit' && line.amount ? line.amount : ''}` — falsy check on `line.amount` means `0` is treated as empty. Also, if the user switches sides, the value disappears.
- **Same at lines 2290–2293** for credit.
- **Fix**: Show `line.amount` when `line.side` matches, regardless of the value. Use `line.side === 'debit' ? (line.amount !== 0 ? line.amount : '') : ''` or better, always show amount on the matching side column.

### 1.5 Inconsistent memo restoration on discard

- **Line 882**: `handleConfirmDiscard` sets `setMemo(journal.note ?? journal.description ?? '')` — falls back to `journal.description`.
- **Line 490**: Initialization sets `setMemo(journal.note ?? '')` — does NOT fall back to description.
- **Fix**: Make both consistent. Memo should be `journal.note ?? ''`. Description is a separate field.

### 1.6 Template mode still allows posting via non-obvious paths

- **Lines 1277–1290**: `journalActionHandlers.post` calls `handlePost()` directly when `isCreatingNew` is true (no confirmation), regardless of `isRecurringNew`.
- **Lines 937–963**: `Cmd+Enter` calls `handlePost()` directly when `canPost` is true, regardless of template mode.
- **Impact**: A user can unintentionally create + post a one-off journal while they think they are creating a recurring template.
- **Fix**:
  - If `isRecurringNew`, hard-disable all post actions and shortcuts.
  - Prefer: separate the “template creation” UI into its own component/route so journal actions (post/void/reverse) do not exist in that state.

### 1.7 Cancel/discard does not fully restore state (data loss + confusing UX)

- **Lines 869–910**: `handleConfirmDiscard` restores only a subset of fields (title/date/memo/lines/recurring enabled+frequency+nextDate+autoPost/attachments). It does **not** restore:
  - `description`
  - `contactId`
  - `reference`
  - `showMoreDetails` (mobile reference toggle)
  - `recurringEndDate`
  - `uploadingFiles` (if user cancels mid-upload)
- **Impact**: Users discard changes but still see mutated fields; it breaks trust (“Did it discard or not?”). This is a production blocker.
- **Fix**:
  - Define a single `hydrateFromJournal(journal, detail)` function that sets *all* derived state.
  - Call it from both the journal selection effect and discard/cancel handlers.

### 1.8 State leak: “Reference” UI toggles persist across journal selections

- **Line 492**: On journal load, code only does `if (journal.reference) setShowMoreDetails(true)` but never sets it to `false` when the next selected journal has no reference.
- **Impact**: Select journal A (has reference) then journal B (no reference) and you can still see “Hide reference” + an empty reference input. This reads like data corruption.
- **Fix**: In the hydration path, always set `showMoreDetails` based on whether `reference` is non-empty.

### 1.9 Currency display is hardcoded to USD in multiple places

- **Template view**: **Line 1247–1248** passes `'USD'` to `FormattedAmount` and contains a “mock fallback” comment.
- **Mobile entry editor**: **Lines 2094–2096** renders a literal `USD` prefix in the amount input.
- **Mobile sticky totals**: **Lines 2727–2755** uses `$` and formats without currency.
- **Impact**: Incorrect money display for any non-USD company or FX journal. This is a production blocker.
- **Fix**:
  - Use the actual journal/template currency code everywhere (likely `journal.currencyCode`, and for templates derive a `currencyCode` from `currencyId`).
  - Replace `$` literals with `FormattedAmount` (or a shared currency formatter) so symbol/code is correct.

### 1.10 Recurring end date is written but never hydrated back

- **Lines 539–547**: `payload.metadata.recurring.endDate` is set from `recurringEndDate`.
- **Lines 169–196** (`getRecurringState`): does not read `endDate`, so the UI cannot restore/show it consistently; saving can accidentally erase it.
- **Fix**: Add `endDate` to the recurring state and ensure it is loaded/reset/discarded consistently.

### 1.11 Timezone correctness: `computeNextDate` can shift dates for non-UTC users

- **Lines 133–156**: `computeNextDate` uses a local-time `Date` then returns a UTC `toISOString().slice(0, 10)`. In timezones ahead of UTC, this can yield the **previous day**.
- **Impact**: Recurring “next date” and displayed dates can drift by 1 day depending on user timezone.
- **Fix**: Do “UTC date math” (treat dates as YYYY-MM-DD without timezone conversions) or adopt a date library.

### 1.12 Recurring “next date” is conflated with auto-reversal

- **Lines 183–186** (`getRecurringState`): `nextDate` falls back to `journal?.autoReversalDate` if present.
- **Impact**: Auto-reversal is a different accounting feature from recurring templates. Mixing them risks incorrect UI (recurring fields populated from reversal date) and incorrect saves.
- **Fix**: Remove `autoReversalDate` from recurring defaults; keep auto-reversal as its own explicit field/section with its own state.

---

## Category 2: Code Duplication

### 2.1 `setLines` update pattern repeated 12+ times

The pattern `setLines(currentLines => currentLines.map(entry => entry.id === line.id ? { ...entry, [field]: value } : entry))` appears in:

- Lines 2013–2019 (mobile: coaId)
- Lines 2032–2038 (mobile: description)
- Lines 2059–2065, 2074–2080 (mobile: side toggles)
- Lines 2113–2122 (mobile: amount onChange)
- Lines 2126–2139 (mobile: amount onBlur)
- Lines 2205–2211 (desktop: coaId)
- Lines 2224–2233 (desktop: description)
- Lines 2260–2276 (desktop: debit amount)
- Lines 2297–2315 (desktop: credit amount)
- Lines 2325–2331, 2340–2346 (hybrid: side toggles)
- Lines 2366–2382 (hybrid: amount)
- Lines 1994–2000 (mobile: remove line)
- Lines 2396–2402 (desktop: remove line)

**Fix**: Extract a helper:

```ts
const updateLine = (lineId: string, updates: Partial<EditableLine>) =>
  setLines((cur) =>
    cur.map((e) => (e.id === lineId ? { ...e, ...updates } : e)),
  );

const removeLine = (lineId: string) =>
  setLines((cur) =>
    cur.length <= 2 ? cur : cur.filter((e) => e.id !== lineId),
  );
```

### 2.2 Mobile and desktop entry grids are near-duplicates

- **Mobile**: Lines 1963–2170 (~210 lines)
- **Desktop/Hybrid**: Lines 2172–2466 (~300 lines)
- Same fields (account, description, side, amount, remove), same handlers, different layouts.
- **Fix**: Extract a `<JournalEntryLine>` component that accepts layout props (`variant: 'card' | 'row'`). Both mobile and desktop use the same component with different styling.

### 2.3 Recurring auto-post hint text repeated 4x

- **Lines 1744, 1750, 1761, 1767**: Exact same two strings repeated as both `title` attribute and visible text.
- **Fix**: Extract to a const: `const recurringHintText = recurringAutoPost ? '...' : '...'`.

### 2.4 Duplicate `isSaving` spinner pattern

- The pattern `{isSaving && <Loader2 className="..." />}` appears in 6 different button locations.
- **Fix**: Extract a `<SaveButton>` or at minimum a shared spinner fragment.

### 2.5 Recurring state reset repeated in 3 places

- Lines 472–476 (initialization for new)
- Lines 895–898 (`handleConfirmDiscard`)
- Lines 493–496 (initialization from existing journal)
- **Fix**: Extract `resetRecurringState(state: RecurringState)` helper.

---

## Category 3: State Management Issues

### 3.1 Suppressed `eslint-disable react-hooks/exhaustive-deps`

- **Line 514**: The initialization effect (lines 447–515) disables the exhaustive-deps rule. This effect reads `title`, `description`, `lines`, `editing`, `pendingNewRef`, `previousJournalIdRef` etc. but only depends on `[detail?.entries, isCreatingNew, journal]`.
- **Fix**: This effect is intentionally "sync from props" — it should only run when the journal data changes, not when local form fields change. The eslint-disable is acceptable here but should have a comment explaining why. Alternatively, restructure to use a `journalId` key to remount.

### 3.2 Five separate `useState` calls for one recurring config

- **Lines 309–314**: `recurringEnabled`, `recurringFrequency`, `recurringNextDate`, `recurringAutoPost`, `recurringEndDate`.
- **Fix**: Consolidate into `useReducer` or a single `useState<RecurringConfig>` object. This eliminates the need to reset 5 states individually in 3 places.

### 3.3 `isDescriptionFocused` relies on 200ms setTimeout

- **Lines 1799–1801**: `onBlur` uses `setTimeout(() => setIsDescriptionFocused(false), 200)` to keep the AI button clickable.
- **Risk**: Race conditions, lingering state.
- **Fix**: Use `onMouseDown` with `preventDefault` on the AI button instead, or use `relatedTarget` check in the blur handler.

### 3.4 `handleSaveRef` assigned during render

- **Line 1375**: `handleSaveRef.current = handleSave` is a render-time side effect.
- **Fix**: Since effect #1 (which uses this ref) should be removed entirely (see 1.2), this ref can be removed too.

### 3.5 Dirty-check only protects “new journal”, not editing existing journals

- **Lines 912–925**: `handleCancelEdit` only prompts discard when `isCreatingNew && isDirty`. For existing journals, it always discards without confirmation.
- **Impact**: Users can lose edits with a single click/back action. In accounting workflows, this breaks trust.
- **Fix**:
  - Track an initial snapshot for existing journals and compute dirty based on comparisons (or use a form library with dirty tracking).
  - Prompt discard for existing edits as well.

---

## Category 4: Mock / Incomplete Implementations (Leave as-is)

### 4.1 Mock AI "suggest entries" + "generate description"

- **Lines 576–660, 1816–1843**: Mock implementations with `setTimeout`. Leave as-is per decision — functional enough for development.

---

## Category 5: Type Safety

### 5.1 Unnecessary `as any` casts

- **Line 1110**: `entries.map((entry: any) => ...)` — should use the recurring template entry type.
- **Line 1227**: Same pattern.
- **Fix**: Import and use the correct type from the recurring template response.

### 5.2 Metadata typed as `Record<string, unknown>`

- **Lines 535–538**: `(journal?.metadata as Record<string, unknown> | null | undefined) ?? {}` — repeated unsafe casting.
- **Fix**: Define a proper `JournalMetadata` type with the `recurring` shape and use it consistently.

---

## Category 6: Error Handling

### 6.1 Catch blocks swallow error details

- **Lines 769, 840, 1015, 1074, 1093, 1128**: All catch blocks show a generic toast with no error details.
- **Fix**: Log the error for debugging (use a proper logger, not `console.error`), and where the API returns a message, surface it: `toast.error(err.message ?? 'Unable to ...')`.

### 6.2 Bare `console.error` in production

- **Line 719**: `console.error('File upload failed', error)`.
- **Fix**: Replace with the app's error reporting mechanism.

---

## Category 7: UX / Accessibility

### 7.1 Desktop "Add line" button doesn't use smart side defaulting

- **Line 2420**: `emptyLine('debit')` — always defaults to debit.
- **Mobile (line 2153)**: `emptyLine(getSmartDefaultSide())` — uses smart logic.
- **Fix**: Desktop should also use `getSmartDefaultSide()`.

### 7.2 Missing `aria-label` on icon-only buttons

- **Lines 1988–2004** (mobile remove), **2390–2406** (desktop remove): `<Button>` with only an `<X>` or `<Trash2>` icon, no accessible label.
- **Lines 2536–2546** (attachment remove): icon-only `<button>` without accessible label.
- **Fix**: Add `aria-label="Remove entry"` / `aria-label="Remove attachment"`.

### 7.3 Mobile amount field UX differs from desktop

- Mobile (lines 2097–2141): Shows raw value when focused, formatted on blur. Has `onFocus`/`onBlur` logic with `focusedAmountId`.
- Desktop (lines 2246–2278, 2283–2316): No focus/blur formatting — always shows raw number.
- **Fix**: Unify the behavior. Both should format on blur and show raw on focus.

---

## Category 8: Performance

### 8.1 All entry lines re-render on any field change

- Every `setLines(...)` call triggers a re-render of the entire lines array.
- **Fix**: Extract each line into a memoized `<JournalEntryLine>` component (also fixes Category 2.2). Pass `updateLine` and `removeLine` callbacks (stable via `useCallback`).

### 8.2 Functions defined inside render for template view

- **Lines 1058–1131**: `handleTemplateStatusChange`, `handleTemplateRunNow`, `handleTemplatePreview` are defined inside the render body (after an early-return check), meaning they're recreated every render.
- **Fix**: When the template view is extracted (see below), these become proper component-level callbacks.

### 8.3 Lists use unstable keys (can cause odd UI behavior)

- **Lines 1227–1252**: Template entries use `key={i}` (index key).
- **Lines 2525–2549** and view-mode attachments: attachments use `key={idx}` (index key).
- **Impact**: When reordering/removing, React can reuse DOM nodes incorrectly; combined with controlled inputs this can manifest as “values jumping” or focus loss.
- **Fix**: Use stable keys (entry id, file key/url, etc.).

---

## Execution Order

We'll tackle these in priority order, grouping by blast radius:

| Phase | Category                    | Tasks                                                 | Files                                                       |
| ----- | --------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| **1** | Critical Logic Bugs (Cat 1) | 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12 | `journal-detail-pane.tsx`, `api/index.ts`, `model/hooks.ts` |
| **2** | Code Duplication (Cat 2)    | 2.1, 2.3, 2.4, 2.5                                    | `journal-detail-pane.tsx`                                   |
| **3** | State Management (Cat 3)    | 3.2, 3.3, 3.4, 3.5                                    | `journal-detail-pane.tsx`                                   |
| **4** | Extract Components (Cat 2)  | 2.2 (entry line), template view                       | `journal-detail-pane.tsx` + new component files             |
| **5** | Type Safety (Cat 5)         | 5.1, 5.2                                              | `journal-detail-pane.tsx`                                   |
| **6** | Error Handling (Cat 6)      | 6.1, 6.2                                              | `journal-detail-pane.tsx`                                   |
| **7** | UX/A11y (Cat 7)             | 7.1, 7.2, 7.3                                         | `journal-detail-pane.tsx`                                   |
| **8** | Performance (Cat 8)         | 8.1, 8.2, 8.3                                         | `journal-detail-pane.tsx` + new component                   |

---

## Verification

After each phase:

1. `pnpm typecheck` — ensures no type errors
2. `pnpm lint` — ensures no lint violations
3. Manual test: Create a new journal (regular + recurring), edit, save, post, void, copy, reverse
4. Manual test: Mobile and desktop layouts both render entries correctly
5. Manual test: Keyboard shortcuts (Cmd+S, Cmd+Enter) fire exactly once
6. Manual test: Changing description/reference/contact and saving persists the correct values
7. Manual test: Switch between two journals with different reference/contact values; verify UI does not leak prior state
8. Manual test: Non-USD company/journal: amounts, totals, and template amounts show correct currency (no hardcoded `$`/`USD`)
9. Manual test: Timezone sanity: recurring “next date” does not shift a day in timezones ahead of UTC
