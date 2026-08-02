# Risk Register (Pre-Seed)

Use this to stay honest in diligence and to drive the 8-12 week execution plan.

## Product risks

- Reporting UI gap: backend has trial balance and balances, but P&L/BS UI is not shipped.
  - Mitigation: ship Close Hub + Trial Balance UI first, then P&L/BS with drill paths using the same shell.

- Client management gap: firm-client invite/assignment and "needs client input" workflows incomplete.
  - Mitigation: implement a minimal invite + assignment + task queue loop; keep messaging v1 lightweight.

- Dashboard credibility: current dashboard surfaces use mock data.
  - Mitigation: keep investor demo on working flows (ingest -> categorize -> post -> journals) and present dashboards as "shipping next".

## ML / automation risks

- Accuracy claims are not measured yet (heuristics are present; evaluation is needed).
  - Mitigation: add evaluation harness, track acceptance rate, and instrument correction labels; treat accuracy as a target until measured.

- Over-automation risk: autopost without clear explainability can reduce trust.
  - Mitigation: confirmation-gated mutations, candidate vs posted separation, explicit review queues, audit trails by default.

## Security / compliance risks

- Multi-tenant authorization must be consistently enforced across company-scoped routes.
  - Mitigation: standardize middleware enforcement and add integration tests for cross-tenant access.

## GTM risks

- Split focus across Nigeria + US can dilute early learning with a small team/raise.
  - Mitigation: Nigeria-first design partners; keep US as "ready" rather than simultaneous push.
