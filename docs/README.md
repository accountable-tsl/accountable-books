# Documentation Index

Start here if you are unsure what to read.

## Local setup

| Doc                                      | Purpose                                                  |
| ---------------------------------------- | -------------------------------------------------------- |
| [local-dev.md](local-dev.md)             | Authoritative local setup (prereqs, hosts, make targets) |
| [ENVIRONMENT.md](ENVIRONMENT.md)         | Environment variables reference                          |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common local failures                                    |

App READMEs: [API](../apps/api/README.md) · [Web](../apps/web/README.md) · [ML Engine](../apps/ml-engine/README.md) · [Contracts](../packages/contracts/README.md)

## Deployment

| Doc                                    | Purpose                                                      |
| -------------------------------------- | ------------------------------------------------------------ |
| [fly-deployment.md](fly-deployment.md) | Fly.io staging deploy, secrets, custom domain, health checks |

## Architecture

| Doc                                                                                                     | Status            | Purpose                                   |
| ------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------- |
| [frontend-structure.md](architecture/frontend-structure.md)                                             | Implemented guide | Web app layering (`features` / `modules`) |
| [workspace-provisioning.md](architecture/workspace-provisioning.md)                                     | Implemented       | How workspaces are created/repaired       |
| [company-access-model.md](architecture/company-access-model.md)                                         | Implemented       | Access origins and permission levels      |
| [work-items-and-transaction-lifecycle.md](architecture/work-items-and-transaction-lifecycle.md)         | Draft             | Work queue + transaction lifecycle model  |
| [transaction-work-story.md](architecture/transaction-work-story.md)                                     | Draft             | Plain-language product narrative          |
| [transaction-flow-to-work-queue-build-map.md](architecture/transaction-flow-to-work-queue-build-map.md) | Draft             | Source → work-queue implementation map    |

## Accounting

| Doc                                                                     | Status               | Purpose                          |
| ----------------------------------------------------------------------- | -------------------- | -------------------------------- |
| [manual-journals_v1.md](accounting/manual-journals_v1.md)               | Implemented          | Manual journals v1               |
| [manual-journals_import_v1.md](accounting/manual-journals_import_v1.md) | Implemented          | CSV import for manual journals   |
| [recurring-journals_v1.md](accounting/recurring-journals_v1.md)         | Implemented / design | Recurring templates + generation |
| [posting-logic.md](accounting/posting-logic.md)                         | Design note          | FX / monetary posting rules      |
| [deleting-bank-txns.md](accounting/deleting-bank-txns.md)               | Design note          | Soft-delete + reversing journals |
| [balances.md](accounting/balances.md)                                   | Design note          | Balance snapshots and workers    |

## Support & security

| Doc                                                                                      | Purpose                   |
| ---------------------------------------------------------------------------------------- | ------------------------- |
| [api/support-access.md](api/support-access.md)                                           | Support access API        |
| [security/customer-support-access-policy.md](security/customer-support-access-policy.md) | Support access policy     |
| [runbooks/support-access-operations.md](runbooks/support-access-operations.md)           | Support access operations |

## Archive

Historical or future-product docs that are **not** current Books implementation guidance:

| Doc                                                                                                     | Why archived                              |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| [accountable-engage-design.md](archive/architecture/accountable-engage-design.md)                       | Future CRM product (not implemented)      |
| [accounting-workbench-v1-product-spec.md](archive/architecture/accounting-workbench-v1-product-spec.md) | Large product/UX spec; keep for reference |

## Classification legend

- **Implemented** — matches current code paths
- **Draft** — active design; may still change
- **Design note** — rough notes / intended behavior; verify against code before relying on it
- **Historical / archive** — not day-to-day contributor guidance
