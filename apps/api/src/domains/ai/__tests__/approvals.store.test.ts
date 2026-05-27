import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import {
  createApproval,
  executeApproval,
  getApproval,
  rejectApproval,
} from '../approvals/approvals.store.js';

describe('ai approvals store - Integration', () => {
  let trx: Knex.Transaction;
  let companyId: string;
  let userId: string;

  beforeEach(async () => {
    const db = getTestDb();
    trx = await db.transaction();
    companyId = await getTestCompanyId(trx, 'bizDemoUS');
    userId = await getTestUserId(trx, US_USER_EMAIL);
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('creates approval and reads it back scoped to company', async () => {
    const created = await createApproval(
      {
        companyId,
        requestedByUserId: userId,
        capabilityId: 'journals.dev_sample.v1',
        domain: 'journals',
        summary: 'Create a draft journal entry',
        risk: 'high',
        tool: 'journals.createDraft',
        toolArgs: { ok: true },
      },
      trx,
    );

    expect(created.status).toBe('pending');
    expect(created.companyId).toBe(companyId);

    const fetched = await getApproval({
      approvalId: created.id,
      companyId,
      trx,
    });
    expect(fetched).toBeTruthy();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.status).toBe('pending');
  });

  it('rejects approval idempotently', async () => {
    const created = await createApproval(
      {
        companyId,
        requestedByUserId: userId,
        capabilityId: 'journals.dev_sample.v1',
        domain: 'journals',
        summary: 'Reject me',
        risk: 'high',
        tool: 'noop',
        toolArgs: {},
      },
      trx,
    );

    const first = await rejectApproval({
      approvalId: created.id,
      companyId,
      trx,
    });
    expect(first.status).toBe('rejected');
    expect(first.decidedAt).toBeTypeOf('number');

    const second = await rejectApproval({
      approvalId: created.id,
      companyId,
      trx,
    });
    expect(second.status).toBe('rejected');
  });

  it('executes approval under lock and becomes executed', async () => {
    const created = await createApproval(
      {
        companyId,
        requestedByUserId: userId,
        capabilityId: 'journals.dev_sample.v1',
        domain: 'journals',
        summary: 'Execute me',
        risk: 'high',
        tool: 'noop',
        toolArgs: {},
      },
      trx,
    );

    const { approval, result } = await executeApproval({
      approvalId: created.id,
      companyId,
      trx,
    });

    expect(approval.status).toBe('executed');
    expect(approval.decidedAt).toBeTypeOf('number');
    expect(result).toEqual({ ok: true, tool: 'noop' });
  });

  it('does not return approval across companies', async () => {
    const created = await createApproval(
      {
        companyId,
        requestedByUserId: userId,
        capabilityId: 'journals.dev_sample.v1',
        domain: 'journals',
        summary: 'Company scoped',
        risk: 'high',
        tool: 'noop',
        toolArgs: {},
      },
      trx,
    );

    const other = await getApproval({
      approvalId: created.id,
      companyId: '00000000-0000-0000-0000-000000000000',
      trx,
    });
    expect(other).toBeNull();
  });
});
