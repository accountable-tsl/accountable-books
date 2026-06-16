import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SYSTEM_USER_ID } from '../../../../bootstrap/phases/users.bootstrap.js';
import { getTestDb } from '../../../../../config/test-db.js';
import { getBankProviderMapping } from '../bankProviderMappings.model.js';

type Fixture = {
  bankId: string;
  providerId: string;
  providerKey: string;
};

describe('bank provider mappings', () => {
  let trx: Knex.Transaction;
  let fixture: Fixture;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    await trx.raw('SET LOCAL search_path TO app, public');
    fixture = await getFixture(trx);
  });

  afterEach(async () => {
    if (trx) await trx.rollback();
  });

  it('finds active mappings by provider institution identifiers', async () => {
    const primaryId = `primary_${randomUUID()}`;
    const alternateId = `alternate_${randomUUID()}`;
    const secondaryReference = `secondary_${randomUUID()}`;

    await insertMapping(trx, fixture, {
      provider_institution_id: primaryId,
      provider_institution_alternate_id: alternateId,
      provider_institution_secondary_reference: secondaryReference,
    });

    await expectMappingLookup(primaryId, primaryId);
    await expectMappingLookup(alternateId, primaryId);
    await expectMappingLookup(secondaryReference, primaryId);
  });

  it('does not return soft-deleted mappings', async () => {
    const primaryId = `deleted_${randomUUID()}`;

    await insertMapping(trx, fixture, {
      provider_institution_id: primaryId,
      is_deleted: true,
      deleted_at: trx.fn.now(),
      deleted_by_id: SYSTEM_USER_ID,
    });

    const result = await getBankProviderMapping(
      {
        providerKey: fixture.providerKey,
        providerInstitutionId: primaryId,
      },
      trx,
    );

    expect(result.success).toBe(false);
  });

  async function expectMappingLookup(
    lookupInstitutionId: string,
    expectedPrimaryInstitutionId: string,
  ): Promise<void> {
    const result = await getBankProviderMapping(
      {
        providerKey: fixture.providerKey,
        providerInstitutionId: lookupInstitutionId,
      },
      trx,
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      bankId: fixture.bankId,
      providerId: fixture.providerId,
      providerInstitutionId: expectedPrimaryInstitutionId,
    });
  }
});

async function getFixture(trx: Knex.Transaction): Promise<Fixture> {
  const provider = await trx('bank_feed_providers')
    .select('id', 'key')
    .where({ status: 'active' })
    .first<{ id: string; key: string }>();
  if (!provider) throw new Error('Expected an active bank feed provider');

  const bank = await trx('banks')
    .select('id')
    .where({ is_deleted: false })
    .first<{ id: string }>();
  if (!bank) throw new Error('Expected a canonical bank');

  return {
    bankId: bank.id,
    providerId: provider.id,
    providerKey: provider.key,
  };
}

async function insertMapping(
  trx: Knex.Transaction,
  fixture: Fixture,
  overrides: Partial<{
    provider_institution_id: string;
    provider_institution_alternate_id: string | null;
    provider_institution_secondary_reference: string | null;
    provider_institution_name: string | null;
    is_deleted: boolean;
    deleted_at: Knex.Raw;
    deleted_by_id: string | null;
  }>,
): Promise<void> {
  await trx('bank_provider_mappings').insert({
    bank_feed_provider_id: fixture.providerId,
    bank_id: fixture.bankId,
    provider_institution_id:
      overrides.provider_institution_id ?? `institution_${randomUUID()}`,
    provider_institution_alternate_id:
      overrides.provider_institution_alternate_id ?? null,
    provider_institution_secondary_reference:
      overrides.provider_institution_secondary_reference ?? null,
    provider_institution_name:
      overrides.provider_institution_name ?? 'Provider Test Institution',
    raw_provider_data: {},
    created_by_id: SYSTEM_USER_ID,
    updated_by_id: SYSTEM_USER_ID,
    is_deleted: overrides.is_deleted ?? false,
    deleted_at: overrides.deleted_at ?? null,
    deleted_by_id: overrides.deleted_by_id ?? null,
  });
}
