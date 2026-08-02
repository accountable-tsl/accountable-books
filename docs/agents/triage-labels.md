# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual status strings used in this repo's issue tracker (local markdown — see `issue-tracker.md`). For local markdown issues, the label is recorded as a `Status:` line near the top of the issue file, not a tracker-native label.

| Role in mattpocock/skills | Status string in this repo | Meaning                                  |
| ------------------------- | -------------------------- | ---------------------------------------- |
| `needs-triage`            | `needs-triage`             | Maintainer needs to evaluate this issue  |
| `needs-info`              | `needs-info`               | Waiting on reporter for more information |
| `ready-for-agent`         | `ready-for-agent`          | Fully specified, ready for an AFK agent  |
| `ready-for-human`         | `ready-for-human`          | Requires human implementation            |
| `wontfix`                 | `wontfix`                  | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), write `Status: <status string>` using the corresponding value from this table.
