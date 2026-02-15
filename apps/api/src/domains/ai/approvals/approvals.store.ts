import type {
  AiApproval,
  AiApprovalStatus,
} from '@accountable-books/contracts/schema';
import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';

const TABLE = 'ai_approvals';

type ApprovalRisk = 'low' | 'medium' | 'high';

type AiApprovalRow = {
  id: string;
  company_id: string;
  requested_by_user_id: string;
  capability_id: string;
  domain: string | null;
  summary: string;
  risk: ApprovalRisk;
  tool: string;
  tool_args: unknown;
  status: AiApprovalStatus;
  created_at: Date;
  decided_at: Date | null;
};

function rowToApproval(row: AiApprovalRow): AiApproval {
  return {
    id: row.id,
    companyId: row.company_id,
    requestedByUserId: row.requested_by_user_id,
    capabilityId: row.capability_id,
    domain: row.domain ?? undefined,
    summary: row.summary,
    risk: row.risk,
    tool: row.tool,
    toolArgs: row.tool_args,
    createdAt: row.created_at.getTime(),
    decidedAt: row.decided_at ? row.decided_at.getTime() : undefined,
    status: row.status,
  };
}

export async function createApproval(
  input: Omit<AiApproval, 'id' | 'createdAt' | 'status' | 'decidedAt'> & {
    risk?: ApprovalRisk;
  },
  trx?: Knex.Transaction,
): Promise<AiApproval> {
  const db = trx ?? knexClient;

  const [row] = (await db(TABLE)
    .insert({
      company_id: input.companyId,
      requested_by_user_id: input.requestedByUserId,
      capability_id: input.capabilityId,
      domain: input.domain ?? null,
      summary: input.summary,
      risk: input.risk ?? 'high',
      tool: input.tool,
      tool_args: input.toolArgs,
      status: 'pending',
      decided_at: null,
    })
    .returning('*')) as AiApprovalRow[];

  if (!row) throw new Error('Failed to create approval');
  return rowToApproval(row);
}

export async function getApproval(params: {
  approvalId: string;
  companyId: string;
  trx?: Knex.Transaction;
}): Promise<AiApproval | null> {
  const db = params.trx ?? knexClient;
  const row = (await db(TABLE)
    .where({ id: params.approvalId, company_id: params.companyId })
    .andWhere({ is_deleted: false })
    .first()) as AiApprovalRow | undefined;
  return row ? rowToApproval(row) : null;
}

export async function rejectApproval(params: {
  approvalId: string;
  companyId: string;
  trx?: Knex.Transaction;
}): Promise<AiApproval> {
  const db = params.trx ?? knexClient;

  const existing = (await db(TABLE)
    .where({ id: params.approvalId, company_id: params.companyId })
    .andWhere({ is_deleted: false })
    .first()) as AiApprovalRow | undefined;
  if (!existing) throw new Error('Approval not found');
  if (existing.status !== 'pending') return rowToApproval(existing);

  const [row] = (await db(TABLE)
    .where({ id: params.approvalId, company_id: params.companyId })
    .update({
      status: 'rejected' satisfies AiApprovalStatus,
      decided_at: db.fn.now(),
    })
    .returning('*')) as AiApprovalRow[];
  if (!row) throw new Error('Approval not found');
  return rowToApproval(row);
}

export async function executeApproval(params: {
  approvalId: string;
  companyId: string;
}): Promise<{ approval: AiApproval; result?: unknown }> {
  return await knexClient.transaction(async (trx) => {
    const existing = (await trx(TABLE)
      .where({ id: params.approvalId, company_id: params.companyId })
      .andWhere({ is_deleted: false })
      .forUpdate()
      .first()) as AiApprovalRow | undefined;

    if (!existing) throw new Error('Approval not found');
    if (existing.status === 'executed') {
      return { approval: rowToApproval(existing) };
    }
    if (existing.status !== 'pending') {
      throw new Error(`Approval is not pending: ${existing.status}`);
    }

    // TODO: dispatch to tool registry and execute transactionally.
    const result = { ok: true, tool: existing.tool };

    const [row] = (await trx(TABLE)
      .where({ id: params.approvalId, company_id: params.companyId })
      .update({
        status: 'executed' satisfies AiApprovalStatus,
        decided_at: trx.fn.now(),
      })
      .returning('*')) as AiApprovalRow[];
    if (!row) throw new Error('Approval not found');

    return { approval: rowToApproval(row), result };
  });
}
