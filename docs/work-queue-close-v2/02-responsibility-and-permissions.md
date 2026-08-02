# Responsibility and permissions

- Firm role says what a person is generally qualified to do.
- Engagement responsibility says which clients they may do it for.
- Work assignment says which exact item they are expected to handle.

Role eligibility never auto-assigns someone to a client. Assignment does not grant permission. Commands re-check independently of what the queue shows.

## Engagement

One firm is responsible for one client's bookkeeping for a defined period (later: other services; different firms may hold different service engagements for the same client).

Activation creates the engagement (after invite, branded signup, platform signup, or transfer acceptance). Intake owns those flows.

Every active engagement has:

- firm, client, service
- responsibility start date (may differ from invite/accept, especially on transfer)
- exactly one Client Lead
- exactly one Primary Bookkeeper (same person may hold both)
- optional Contributors
- optional Catch-up Packages
- on transfer: previous engagement + cutover

Only one active engagement per client + service at a time. Required responsibilities cannot be removed without replacement.

## Firm roles

| Role      | Meaning                                    |
| --------- | ------------------------------------------ |
| `admin`   | Full firm access — settings, billing, team |
| `manager` | Oversight, review/approve                  |
| `staff`   | Does assigned work                         |

## Who may hold which responsibility

| Responsibility     | Allowed firm roles          |
| ------------------ | --------------------------- |
| Client Lead        | `manager`, `admin`          |
| Primary Bookkeeper | `staff`, `manager`, `admin` |
| Contributor        | any firm member             |

Default work routing: preparation → Primary Bookkeeper; approval → Client Lead.

## Who sees what

| Who                | Sees                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Firm `admin`       | All firm engagements and work (when firm oversight is used; not necessarily the default landing view) |
| Firm `manager`     | Assigned portfolios by default                                                                        |
| Client Lead        | All work and close for their clients                                                                  |
| Primary Bookkeeper | All bookkeeping work and close prep for their clients                                                 |
| Contributor        | Client access; directly assigned work only                                                            |
| Client users       | Actions expected of them — not the firm queue                                                         |

Same person as Lead + Bookkeeper: submit and approve can run as one close; no self-addressed approval work.

## Permissions for this area

DB shape: store `resource` + `action`; key is generated as `resource:action`.

| Resource        | Action                | Who gets it                                                                         |
| --------------- | --------------------- | ----------------------------------------------------------------------------------- |
| `queue`         | `firm_oversight`      | Firm `admin` by default; others only if explicitly granted                          |
| `client`        | `add`                 | Who may open intake / add a client                                                  |
| `period_close`  | `submit`              | Primary Bookkeeper (or package assignee when that routing applies)                  |
| `period_close`  | `approve`             | Client Lead                                                                         |
| `period_close`  | `reject`              | Client Lead                                                                         |
| `close_package` | `manage`              | Client Lead inherent; others only via explicit grant (does **not** include approve) |
| `period_reopen` | `decide`              | Client Lead inherent; others only via explicit grant                                |
| `finding`       | `decide_professional` | Client Lead where the finding requires it                                           |
| `close_version` | `read_historical`     | Former-firm member reading an immutable past version only                           |

Lead/Bookkeeper/Contributor authority above is engagement-scoped. Role grants alone never put someone on a client.
