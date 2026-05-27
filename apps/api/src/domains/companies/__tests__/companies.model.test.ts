import type { Knex } from 'knex';
import { normalizeTimezoneId } from '@accountable-books/utils/timezone';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { knexClient } from '../../../db/knexClient.js';
import { ErrorCode } from '../../../shared/utils/response.utils.js';
import { getSingleCompany, updateCompany } from '../companies.model.js';

describe('companies model', () => {
  let trx: Knex.Transaction;
  let companyId: string;
  let userId: string;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    companyId = await getTestCompanyId(trx, 'bizDemoUS');
    userId = await getTestUserId(trx, US_USER_EMAIL);
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('maps defaultTimezone and verification in getSingleCompany response', async () => {
    const companyRow = await knexClient('companies')
      .select(
        'short_code',
        'default_timezone',
        'legal_name_verified_at',
        'registration_number_verified_at',
        'tax_id_verified_at',
        'address_verified_at',
      )
      .where('id', companyId)
      .first();

    if (!companyRow) {
      throw new Error('Expected seeded demo company to exist');
    }

    const result = await getSingleCompany(companyId);

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe(companyRow.short_code);
    expect(result.data?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.data?.defaultTimezone).toBe(
      normalizeTimezoneId(companyRow.default_timezone) ?? 'Etc/UTC',
    );
    expect(result.data?.verification).toEqual({
      legalName: {
        verifiedAt: companyRow.legal_name_verified_at?.toISOString() ?? null,
      },
      address: {
        verifiedAt: companyRow.address_verified_at?.toISOString() ?? null,
      },
      registrationNumber: {
        verifiedAt:
          companyRow.registration_number_verified_at?.toISOString() ?? null,
      },
      taxId: {
        verifiedAt: companyRow.tax_id_verified_at?.toISOString() ?? null,
      },
    });
  });

  it('reads company logo fields from the attached file record', async () => {
    const [file] = await trx('files')
      .insert({
        name: 'logo.png',
        key: `${companyId}/company-logo/logo.png`,
        bucket_name: 'logos',
        url: 'https://logos.getaccountable.com/new-logo.png',
        mime_type: 'image/png',
        size_bytes: 1024,
        checksum: null,
        provider: 'cloudflare_r2',
        region: null,
        endpoint: null,
        company_id: companyId,
        uploaded_by_id: userId,
      })
      .returning(['id']);

    await trx('companies').where('id', companyId).update({
      logo_file_id: file.id,
    });

    const result = await getSingleCompany(companyId, trx);

    expect(result.success).toBe(true);
    expect(result.data?.companyLogo).toBe(
      'https://logos.getaccountable.com/new-logo.png',
    );
    expect(result.data?.companyLogoKey).toBe(
      `${companyId}/company-logo/logo.png`,
    );
  });

  it('trims persisted updates and normalizes empty nullable strings to null', async () => {
    const result = await updateCompany(
      companyId,
      {
        legalName: '  Updated Legal Name  ',
        displayName: '  Updated Display Name  ',
        address: '  12 Example Street  ',
        companyTaxId: '   ',
        defaultTimezone: ' America/New_York ',
      },
      userId,
      trx,
    );

    expect(result.success).toBe(true);
    expect(result.data?.legalName).toBe('Updated Legal Name');
    expect(result.data?.displayName).toBe('Updated Display Name');
    expect(result.data?.address).toBe('12 Example Street');
    expect(result.data?.companyTaxId).toBeNull();
    expect(result.data?.defaultTimezone).toBe('America/New_York');

    const updated = await trx('companies')
      .select(
        'legal_name',
        'display_name',
        'address',
        'tax_id',
        'default_timezone',
      )
      .where('id', companyId)
      .first();

    expect(updated).toMatchObject({
      legal_name: 'Updated Legal Name',
      display_name: 'Updated Display Name',
      address: '12 Example Street',
      tax_id: null,
      default_timezone: 'America/New_York',
    });
  });

  it('persists canonical timezone ids when an alias is submitted', async () => {
    const result = await updateCompany(
      companyId,
      { defaultTimezone: 'UTC' },
      userId,
      trx,
    );

    expect(result.success).toBe(true);
    expect(result.data?.defaultTimezone).toBe('Etc/UTC');

    const updated = await trx('companies')
      .select('default_timezone')
      .where('id', companyId)
      .first();

    expect(updated?.default_timezone).toBe('Etc/UTC');
  });

  it('allows whitespace-only updates to a verified legal name', async () => {
    await trx('companies').where('id', companyId).update({
      legal_name: 'Acme Verified Ltd',
      legal_name_verified_at: new Date(),
    });

    const result = await updateCompany(
      companyId,
      { legalName: '  Acme Verified Ltd  ' },
      userId,
      trx,
    );

    expect(result.success).toBe(true);

    const updated = await trx('companies')
      .select('legal_name')
      .where('id', companyId)
      .first();

    expect(updated?.legal_name).toBe('Acme Verified Ltd');
  });

  it.each([
    {
      name: 'legal name',
      setup: {
        legal_name: 'Acme Verified Ltd',
        legal_name_verified_at: new Date(),
      },
      payload: { legalName: 'Different Legal Name' },
      expectedMessage: 'Legal name is verified and cannot be changed',
    },
    {
      name: 'registration number',
      setup: {
        registration_number: 'REG-123',
        registration_number_verified_at: new Date(),
      },
      payload: { companyRegistrationNumber: 'REG-456' },
      expectedMessage: 'Registration number is verified and cannot be changed',
    },
    {
      name: 'tax ID',
      setup: {
        tax_id: 'TAX-123',
        tax_id_verified_at: new Date(),
      },
      payload: { companyTaxId: 'TAX-456' },
      expectedMessage: 'Tax ID is verified and cannot be changed',
    },
  ])(
    'blocks changing a verified $name',
    async ({ setup, payload, expectedMessage }) => {
      await trx('companies').where('id', companyId).update(setup);

      const result = await updateCompany(companyId, payload, userId, trx);

      expect(result.success).toBe(false);
      expect(result.code).toBe(ErrorCode.OPERATION_NOT_ALLOWED);
      expect(result.message).toBe(expectedMessage);
    },
  );

  it('writes a profile-updated audit diff and clears address verification when address changes', async () => {
    await trx('companies').where('id', companyId).update({
      address: 'Old Address',
      address_verified_at: new Date(),
    });

    const result = await updateCompany(
      companyId,
      { address: '  New Address  ' },
      userId,
      trx,
      {
        audit: {
          actor: { type: 'user', userId },
          context: { source: 'api' },
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.data?.address).toBe('New Address');
    expect(result.data?.verification.address.verifiedAt).toBeNull();

    const updated = await trx('companies')
      .select('address', 'address_verified_at')
      .where('id', companyId)
      .first();

    expect(updated?.address).toBe('New Address');
    expect(updated?.address_verified_at).toBeNull();

    const auditRow = await trx('audit_events')
      .where({
        company_id: companyId,
        entity_id: companyId,
        entity_type: 'company',
        action: 'company.profile_updated',
      })
      .select('payload', 'actor_type', 'actor_id', 'user_id')
      .first();

    expect(auditRow).toBeTruthy();
    expect(auditRow?.actor_type).toBe('user');
    expect(auditRow?.actor_id).toBe(userId);
    expect(auditRow?.user_id).toBe(userId);
    expect(auditRow?.payload).toEqual({
      changedFields: {
        address: {
          previous: 'Old Address',
          next: 'New Address',
        },
      },
      clearedVerification: ['address'],
    });
  });

  it('preserves NOT_FOUND when the company identifier does not exist', async () => {
    const result = await getSingleCompany('missing-company');

    expect(result.success).toBe(false);
    expect(result.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('updates firm metadata when only slug fields change on an accounting firm', async () => {
    const firmCompanyId = await getTestCompanyId(trx, 'firmDemoUS');

    const before = await trx('accounting_firms_meta')
      .join('companies', 'companies.id', 'accounting_firms_meta.company_id')
      .select('accounting_firms_meta.slug')
      .where('companies.id', firmCompanyId)
      .first();

    expect(before?.slug).toBeTruthy();

    const result = await updateCompany(
      firmCompanyId,
      { slug: 'firm-updated-slug' },
      userId,
      trx,
      {
        audit: {
          actor: { type: 'user', userId },
          context: { source: 'api' },
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('Successfully updated company details');
    expect(result.data?.assignedFirmSlug).toBe('firm-updated-slug');

    const after = await trx('accounting_firms_meta')
      .join('companies', 'companies.id', 'accounting_firms_meta.company_id')
      .select('accounting_firms_meta.slug')
      .where('companies.id', firmCompanyId)
      .first();

    expect(after?.slug).toBe('firm-updated-slug');

    const auditRow = await trx('audit_events')
      .where({
        company_id: firmCompanyId,
        entity_id: firmCompanyId,
        entity_type: 'company',
        action: 'company.profile_updated',
      })
      .select('payload')
      .first();

    expect(auditRow?.payload).toEqual({
      changedFields: {
        slug: {
          previous: before?.slug ?? null,
          next: 'firm-updated-slug',
        },
      },
      clearedVerification: [],
    });
  });

  it('accepts multi-segment IANA timezones in company updates', async () => {
    const result = await updateCompany(
      companyId,
      { defaultTimezone: 'America/Argentina/Buenos_Aires' },
      userId,
      trx,
    );

    expect(result.success).toBe(true);
    expect(result.data?.defaultTimezone).toBe('America/Argentina/Buenos_Aires');

    const updated = await trx('companies')
      .select('default_timezone')
      .where('id', companyId)
      .first();

    expect(updated?.default_timezone).toBe('America/Argentina/Buenos_Aires');
  });
});
