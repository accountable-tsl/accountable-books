import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getTestDb } from '../../../../config/test-db.js';
import { writeAuditEvent } from '../audit.model.js';

describe('writeAuditEvent', () => {
  let trx: Knex.Transaction;
  let companyId: string;
  let userId: string;

  beforeEach(async () => {
    const db = getTestDb();
    trx = await db.transaction();

    const [user] = await trx('users')
      .insert({
        firstname: 'Audit',
        lastname: 'Tester',
        email: `audit-${uuidv4()}@example.com`,
        user_type: 'regular',
      })
      .returning<{ id: string }[]>('id');
    if (!user) throw new Error('Failed to create audit test user');
    userId = user.id;

    const country = await trx('countries')
      .where({ code: 'US' })
      .select<{ id: string }[]>('id')
      .first();
    if (!country) throw new Error('US country not found');

    const currency = await trx('currencies')
      .where({ code: 'USD' })
      .select<{ id: string }[]>('id')
      .first();
    if (!currency) throw new Error('USD currency not found');

    const [company] = await trx('companies')
      .insert({
        legal_name: 'Audit Test Company',
        short_code: `audit-${uuidv4().slice(0, 8)}`,
        type: 'business',
        year_end_day: 31,
        year_end_month: 12,
        accounting_basis: 'modified_accrual_basis',
        country_id: country.id,
        reporting_currency_id: currency.id,
        created_by_id: userId,
      })
      .returning<{ id: string }[]>('id');
    if (!company) throw new Error('Failed to create audit test company');
    companyId = company.id;
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

  it('prevents updates and deletes after an audit event is written', async () => {
    const payloadSchema = z.object({ ok: z.boolean() });
    const entityId = uuidv4();

    await writeAuditEvent(
      payloadSchema,
      {
        companyId,
        entityType: 'journal',
        entityId,
        action: 'journal.create',
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
      .select('id')
      .first();
    if (!row?.id) throw new Error('Expected audit event to be written');

    await expect(
      trx.transaction(async (attempt) => {
        await attempt('audit_events')
          .where({ id: row.id })
          .update({ notes: 'changed' });
      }),
    ).rejects.toThrow(/append-only/i);

    await expect(
      trx.transaction(async (attempt) => {
        await attempt('audit_events').where({ id: row.id }).delete();
      }),
    ).rejects.toThrow(/append-only/i);
  });
});
