import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { writeAuditEvent } from '../audit.model.js';

describe('writeAuditEvent', () => {
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

  it('accepts camelCase input, leaves payload untouched, and inserts snake_case fields', async () => {
    const payloadSchema = z.object({
      fooBar: z.string(),
      nested: z.object({ innerValue: z.number() }),
    });

    const entityId = uuidv4();

    await writeAuditEvent(
      payloadSchema,
      {
        companyId,
        entityType: 'journal',
        entityId,
        action: 'journal.create',
        schemaVersion: '1.0.0',
        payload: {
          fooBar: 'baz',
          nested: { innerValue: 42 },
        },
        actorType: 'user',
        actorId: userId,
        userId,
        eventAt: new Date().toISOString(),
        source: 'api',
        notes: 'test',
      },
      trx,
    );

    const row = await trx('audit_events')
      .where({ company_id: companyId, entity_id: entityId })
      .select(
        'id',
        'company_id',
        'entity_type',
        'payload',
        'actor_type',
        'actor_id',
        'user_id',
      )
      .first();

    expect(row).toBeTruthy();
    expect(row.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(row.company_id).toBe(companyId);
    expect(row.entity_type).toBe('journal');
    expect(row.actor_type).toBe('user');
    expect(row.actor_id).toBe(userId);
    expect(row.user_id).toBe(userId);
    expect(row.payload).toEqual({
      fooBar: 'baz',
      nested: { innerValue: 42 },
    });
  });

  it('rejects system actor with a non-null actorId', async () => {
    const payloadSchema = z.object({ ok: z.boolean() });

    await expect(
      writeAuditEvent(
        payloadSchema,
        {
          companyId,
          entityType: 'journal',
          entityId: uuidv4(),
          action: 'journal.create',
          schemaVersion: '1.0.0',
          payload: { ok: true },
          actorType: 'system',
          actorId: userId, // invalid for system
          eventAt: new Date().toISOString(),
          source: 'api',
        },
        trx,
      ),
    ).rejects.toThrow(/actor_id/i);
  });

  it('rejects user actor when userId is missing', async () => {
    const payloadSchema = z.object({ ok: z.boolean() });

    await expect(
      writeAuditEvent(
        payloadSchema,
        {
          companyId,
          entityType: 'journal',
          entityId: uuidv4(),
          action: 'journal.create',
          schemaVersion: '1.0.0',
          payload: { ok: true },
          actorType: 'user',
          actorId: userId,
          userId: null, // invalid per DB + schema constraint
          eventAt: new Date().toISOString(),
          source: 'api',
        },
        trx,
      ),
    ).rejects.toThrow(/user_id/i);
  });

  it('rejects non-system actor when actorId is missing', async () => {
    const payloadSchema = z.object({ ok: z.boolean() });

    await expect(
      writeAuditEvent(
        payloadSchema,
        {
          companyId,
          entityType: 'journal',
          entityId: uuidv4(),
          action: 'journal.create',
          schemaVersion: '1.0.0',
          payload: { ok: true },
          actorType: 'api_key',
          actorId: null, // invalid unless actorType=system
          eventAt: new Date().toISOString(),
          source: 'api',
        },
        trx,
      ),
    ).rejects.toThrow(/actor_id/i);
  });

  it('rejects non-user actor when userId is provided', async () => {
    const payloadSchema = z.object({ ok: z.boolean() });

    await expect(
      writeAuditEvent(
        payloadSchema,
        {
          companyId,
          entityType: 'journal',
          entityId: uuidv4(),
          action: 'journal.create',
          schemaVersion: '1.0.0',
          payload: { ok: true },
          actorType: 'integration',
          actorId: uuidv4(),
          userId, // invalid unless actorType=user
          eventAt: new Date().toISOString(),
          source: 'api',
        },
        trx,
      ),
    ).rejects.toThrow(/user_id/i);
  });

  it('allows multi-segment action names', async () => {
    const payloadSchema = z.object({ ok: z.boolean() });
    const entityId = uuidv4();

    await writeAuditEvent(
      payloadSchema,
      {
        companyId,
        entityType: 'journal',
        entityId,
        action: 'journal.batch.create',
        schemaVersion: '1.0.0',
        payload: { ok: true },
        actorType: 'user',
        actorId: userId,
        userId,
        eventAt: new Date().toISOString(),
        source: 'api',
      },
      trx,
    );

    const row = await trx('audit_events')
      .where({ company_id: companyId, entity_id: entityId })
      .select('action')
      .first();

    expect(row?.action).toBe('journal.batch.create');
  });
});
