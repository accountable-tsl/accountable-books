```
Bank Transaction Added
    ↓
[1] Insert into bank_transactions (status: uncategorized)
    ↓
[2] Queue Enrichment Job
    ↓
[3] Enrichment Worker:
    - Normalize & enrich transaction
    - Persist to categorization_tasks
    - Emit transaction-enriched event
    ↓
[4] Rules Engine:
    - Run deterministic rules
    - If match → processPredictionToCandidate()
    - Check if ML should run
    ↓
[5] ML Prediction (if needed):
    - Call ML Engine API
    - Assemble journal lines
    - processPredictionToCandidate()
    ↓
[6] Constraint Resolver (processPredictionToCandidate):
    - Validate constraints (balance, amounts, bank leg)
    - Persist prediction
    - Resolve candidate creation (check for posted/rule candidates)
    - Cleanup stale candidates
    - Create candidate (if allowed)
    - Persist violations (if any)
    ↓
[7] Candidate Ready for Review
    - Status: 'proposed'
    - Waiting for user approval/posting
```
