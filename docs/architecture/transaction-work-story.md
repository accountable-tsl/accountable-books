# Transaction Work Story

> **Status:** Draft
> **Owner:** Product + Engineering
> **Purpose:** Plain-language product narrative for transaction → work.

This document tells the product story in plain language. The companion lifecycle reference is [Work Items and Transaction Lifecycle](./work-items-and-transaction-lifecycle.md).

## The Story

A bank transaction arrives. Two things are true at once.

First, something happened. Money moved, and the system should remember that as activity. Counts can go up. The client or bookkeeper can see that new transactions came in.

Second, there may now be work to do. In a world with no rules, no ML, and no automation, the story is simple: the transaction sits in the transaction workspace as `needs_categorization`, and a grouped work item tells the right user that transactions need to be categorized.

Automation changes how much work the user sees. It does not change what the work means.

When the transaction is recorded, the system may start rules, enrichment, contact matching, aliases, and ML. While those jobs run, the transaction remains visible in the workspace. The queue should not spray noisy rows for every temporary state. The work materializer keeps recalculating the current truth and shows the work that remains after the system has done what it reasonably can.

Rules run first because rules represent explicit firm or company intent. If a rule matches, the system explains why: which rule matched, which conditions passed, and what posting the rule proposes.

If a rule produces a proposed posting, we validate it.

If validation fails because of malformed provider data, missing system setup, internal inconsistency, or a transient job problem, that is not normal user work. It belongs to retry, ingestion remediation, or operations alerting.

If validation fails because an authorized user must make a business or accounting decision, the transaction becomes `posting_requires_user_action`.

If the proposed posting is valid, posting policy decides what happens next.

If policy allows posting, the transaction is posted to the ledger. That is activity, not queue work. The user should be able to see what happened, which rule caused it, why it matched, and why policy allowed posting.

If policy does not allow posting, the proposal becomes `suggestion_ready_for_review`. That is work. The user can approve it, edit it and post, or reject it.

This distinction matters:

- `suggestion_ready_for_review` means the proposal is valid, but policy wants a human decision before posting.
- `posting_requires_user_action` means the proposal is not ready to post until a user fixes a business or accounting condition.

One asks, "Do you approve this valid suggestion?"

The other asks, "What must change before this can be posted?"

ML still runs even when rules matched. It helps us learn, measure, and improve. But learning is not the same thing as user-facing work. A rule-backed candidate may be the active candidate while ML predictions are stored as shadow evidence. If rules do not produce a usable proposal and ML does, ML can become the active suggestion, subject to the same validation and posting policy.

If neither rules nor ML can produce a usable proposal, the transaction remains `needs_categorization`.

If the user rejects the available proposal and no better active proposal remains, the transaction returns to `needs_categorization`.

As all this happens, the unit of work is not a vague sentence. It is a work item subject. One hundred synced transactions may become several clear groups:

- transactions still needing categorization
- suggestions waiting for review
- user-fixable posting conditions
- posted transactions requiring explicit review by policy

The grouped work item keeps the queue calm. The subjects preserve the exact transactions, candidates, ledger entries, close findings, and underlying evidence that need attention.

If the user manually categorizes a transaction before automation finishes, the ledger wins. Late candidates must not become active work. They become expired or superseded evidence. Where fair, we may compare them against the final posting for learning. But we must not pretend the user accepted something they never saw, even if we were correct.

Contact resolution, aliases, descriptions, projects, and attachments are part of the same flow. They can enrich a proposal, change suggestion quality, or trigger advisory and close-review rules. They should not create separate queue work unless they require a user action.

The moment we have a proposed posting, whether from rules, ML, or a user draft, we can evaluate it against advisory and close-style rules before it reaches the ledger. This pre-posting advice must use suggestive language because the user may not agree with our proposed categorization. It can say, for example, "If you post this to receivables, adding a contact will help later review." It must not pretend a close finding exists before the ledger posting exists.

Once a transaction hits the ledger, the ledger is the accounting truth.

Journals follow the same deeper story, even though they do not start from bank transactions.

Journals are important because many accrual-basis realities enter this app through journals: depreciation, accruals, bills, revenue adjustments, revenue recognition, corrections, and other entries we may not model as separate modules in this product. Future plugins or external systems may generate some of these journals, but once they enter this app, they still become proposed postings and then ledger truth.

When a journal is being created, the system can advise without taking over. If the user posts depreciation expense, we may expect accumulated depreciation or an asset-related line somewhere in the journal. If the system sees one side without the other, it can gently point that out. But we should be careful. Journals can touch many accounts at once, and the presence or absence of one account does not automatically mean the user is wrong.

The rule is the same as with bank transactions: pre-posting journal advice is suggestive. It helps the user think. It does not pretend to be a final close finding, and it should not block normal work unless the posting is structurally invalid or policy explicitly requires a decision.

When a journal is posted, it touches the ledger. From that point, journal-sourced and bank-sourced postings enter the same close-review world. The system can still explain origin: this close finding came from a journal, that one came from a bank transaction, another came from a future invoice or tax flow. But the review engine should not need a separate universe for each source. It should understand posted ledger facts and point back to the source that created them.

Journals also create activity. A user posted five journals in April. A recurring journal ran. A depreciation adjustment was created. Those events matter, even when they are not work items. They help users trust that the system is alive, and they give us material for period-end summaries: transactions categorized, journals posted, findings resolved, reports sent.

At that moment the system asks two different questions.

First: how did our suggestion compare to what actually got posted?

That is a learning and explanation question. It tells us whether rules or ML predicted the user's final posting shape. It does not decide whether the posting is good accounting.

A user may reject an initial suggestion and later post the same account manually. That does not mean they accepted the suggestion. It means the suggestion was rejected, and the final posting comparison happened to match. We need both facts.

A user may choose to post cash inflow directly to revenue in an accrual-basis company. That may be their preference. It may also be something we want to challenge or review. Those are different questions.

Second: does the posted ledger entry satisfy close and readiness policy?

That is a review quality question. Close policy can say: this deserves review, add a contact, attach support, use receivables, or acknowledge why this is acceptable.

If the posted ledger entry satisfies close policy, nothing new goes to the queue. The activity and audit trail still explain what happened.

If the posted ledger entry does not satisfy close policy, an actionable finding appears through the work item system. The user can fix the source, amend the posting, acknowledge the issue, or mark it not applicable where policy allows.

Those findings should not spray into the queue one raw signal at a time. If ten postings create the same review concern for the same period and accounts, the queue should show the grouped work and preserve the underlying postings as drill-down evidence. The user sees one clear thing to resolve; the system keeps every ledger row, signal, and decision traceable.

At period end, close readiness does not invent a new universe. It summarizes unresolved work (and asks certain questions necessary to close the period):

- uncategorized bank transactions
- suggestions still awaiting decision
- user-fixable posting conditions
- draft or invalid journals
- posted entries requiring review
- close finding rollups without matching decisions
- closed-period exceptions

When those are resolved, decisioned, or explicitly accepted by policy, the period can move forward.

If nothing needs attention, the user should still see a positive moment. A clean period should produce a ready-to-close receipt, not an empty silence. The system should be able to say: this period is ready, here is what happened, here is what was reviewed, and here is the next step.

After the period is closed, new changes do not silently disappear into normal workflow. They become closed-period action work.

The promise to the user is simple: the queue shows what needs attention, the workspace takes them to the right place to fix it, the activity trail explains what happened, and the ledger remains the source of accounting truth.

The complexity belongs to us.
