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
    - If match → handlePostPrediction() → processPredictionToCandidate()
    - Check if ML should run
    ↓
[5] ML Prediction (if needed):
    - Call ML Engine API
    - Assemble journal lines
    - handlePostPrediction() → processPredictionToCandidate()
    ↓
[6] Post-Prediction Processing (processPredictionToCandidate):
    - Validate data consistency (company IDs, bank transaction IDs)
    - Persist prediction (what rule/ML engine decided, WITHOUT bank leg)
    - Validate bank transaction exists and belongs to company
    - Validate all COA IDs exist, are active, and belong to company
    - Build bank leg (counterpart to prediction lines)
    - Build complete journal entry (bank leg + prediction lines)
    - Run constraint validation on complete journal entry
    - If valid: persist candidate (with conflict resolution)
    - If invalid: log event and throw error (prediction still persisted for audit)
    ↓
[7] Candidate Ready for Review
    - Status: 'proposed'
    - Waiting for user approval/posting
```

## Design Decisions

### Late Constraint Validation

**Decision**: Constraints are validated AFTER persisting predictions, not before.

**Rationale**:

- Provides complete auditability - we store what rules/ML actually returned, even if invalid
- Enables debugging and analysis of prediction quality
- Allows tracking of constraint violations over time
- Predictions serve as a record of engine decisions regardless of validity

**Trade-off**: Less efficient (writes invalid predictions to DB), but prioritizes auditability and debugging capability.

### No Bank Legs in Predictions

**Decision**: Predictions do NOT include bank legs. Bank legs are only added when building candidates.

**Rationale**:

- Predictions represent what the rule/ML engine decided (the categorization)
- Bank legs are deterministic - they're always the counterpart to the transaction
- Separating predictions (engine output) from complete journal entries (candidates) provides clearer separation of concerns
- Allows us to audit what the engine predicted vs. the final journal entry

**Implementation**:

- `buildPredictionFromRuleResult()` creates predictions without bank legs
- `processPredictionToCandidate()` adds the bank leg when building the complete journal entry

### Simplified Flow with Built-in Conflict Resolution

**Decision**: The flow uses `persistCategorizationCandidate()` which handles candidate conflicts automatically.

**Rationale**:

- Simpler, more linear flow that's easier to understand and maintain
- Conflict resolution logic is centralized in one place
- Automatic handling of source priority (rule > ml > ml_heuristic) and confidence comparison
- Events are logged automatically for candidate_created, candidate_replaced, or candidate_ignored

**Flow**:

1. `handlePostPrediction()` routes by source, persists prediction via `persistPredictionOnly()`, then calls `processPredictionToCandidate()`
2. `handleRulePrediction()` builds prediction data from rule results
3. `processPredictionToCandidate()` validates, builds journal entry, validates constraints, and persists candidate
4. `persistCategorizationCandidate()` handles conflicts and persistence automatically
