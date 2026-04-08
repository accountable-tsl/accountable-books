# Support Access Operations Runbook

## Default Path

For real customer companies, use customer-granted support access first. Do not rely on blanket platform access.

## When To Use A Support Grant

Use a support grant when a customer wants Accountable support to inspect or update company profile settings.

Preferred flow:

1. Customer admin grants access to a named support user.
2. Choose the narrowest access level needed.
3. Set the shortest practical expiry.
4. Revoke the grant when the task is complete.

## Access Levels

- `read_only`
  - for investigation, walkthroughs, and troubleshooting
  - maximum lifetime: 7 days
- `company_profile_write`
  - only for workspace/company profile PATCH operations
  - assignee must be `support_admin`
  - maximum lifetime: 24 hours

## Demo And Internal Companies

- Demo companies are editable only by platform users.
- Customer-granted support access is not used for demo companies.
- Internal/platform companies use direct platform access, not support grants.

## Break-Glass

Use break-glass only for emergencies such as account recovery, incident response, or a production-blocking customer issue.

Requirements:

- actor must be `super_admin`
- reason is mandatory
- session must be time-boxed
- notifications go to customer admins
- close the session as soon as the work is complete

## Audit Expectations

Operators should expect a matching audit trail for:

- grant creation
- grant revocation
- break-glass opened
- break-glass closed

## Safety Checklist

- Confirm the target company is a real customer company, not demo or internal.
- Prefer `read_only` unless a write is clearly required.
- Verify the support assignee is the intended named user.
- Keep expiry short.
- Revoke or close access promptly after the task.
