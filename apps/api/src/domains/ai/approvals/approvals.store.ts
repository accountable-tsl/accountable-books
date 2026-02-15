import type { AiApproval } from '@accountable-books/contracts/schema';

// MVP store: in-memory approvals map.
// Launch state: replace with Postgres-backed store (and audit logging).
const approvals = new Map<string, AiApproval>();

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createApproval(
  input: Omit<AiApproval, 'id' | 'createdAt' | 'status'>,
): AiApproval {
  const id = newId('appr');
  const approval: AiApproval = {
    ...input,
    id,
    createdAt: Date.now(),
    status: 'pending',
  };
  approvals.set(id, approval);
  return approval;
}

export function getApproval(id: string) {
  return approvals.get(id) ?? null;
}

export function rejectApproval(id: string): AiApproval {
  const approval = approvals.get(id);
  if (!approval) throw new Error('Approval not found');
  if (approval.status !== 'pending') return approval;
  const next: AiApproval = {
    ...approval,
    status: 'rejected',
    decidedAt: Date.now(),
  };
  approvals.set(id, next);
  return next;
}

export function executeApproval(id: string): {
  approval: AiApproval;
  result?: unknown;
} {
  const approval = approvals.get(id);
  if (!approval) throw new Error('Approval not found');
  if (approval.status === 'executed') return { approval };
  if (approval.status !== 'pending')
    throw new Error(`Approval is not pending: ${approval.status}`);

  // TODO: dispatch to tool registry and execute transactionally.
  const result = { ok: true, tool: approval.tool };

  const next: AiApproval = {
    ...approval,
    status: 'executed',
    decidedAt: Date.now(),
  };
  approvals.set(id, next);
  return { approval: next, result };
}
