import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { ErrorCode } from '../../../shared/utils/response.utils.js';
import {
  createUploadIntent,
  detachCompanyLogo,
  finalizeUploadIntent,
} from '../file-uploads.service.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/upload'),
}));

describe('file uploads service', () => {
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

  it('creates, finalizes, and detaches a company logo through files + upload intents', async () => {
    const intent = await createUploadIntent(
      {
        companyId,
        purpose: 'company_logo',
        fileName: 'logo.png',
        contentType: 'image/png',
        sizeBytes: 1024,
      },
      userId,
      trx,
    );

    expect(intent.success).toBe(true);
    expect(intent.data?.fileKey).toContain(`${companyId}/company-logo/`);

    const finalized = await finalizeUploadIntent(
      {
        companyId,
        intentId: intent.data!.intentId,
      },
      userId,
      trx,
    );

    expect(finalized.success).toBe(true);
    expect(finalized.data?.url).toContain('logos');

    const company = await trx('companies')
      .select('logo_file_id')
      .where('id', companyId)
      .first();

    expect(company?.logo_file_id).toBe(finalized.data?.fileId);

    const detached = await detachCompanyLogo({ companyId, trx });
    expect(detached.success).toBe(true);

    const clearedCompany = await trx('companies')
      .select('logo_file_id')
      .where('id', companyId)
      .first();

    expect(clearedCompany).toMatchObject({
      logo_file_id: null,
    });
  });

  it('marks expired upload intents unusable during finalize', async () => {
    const intent = await createUploadIntent(
      {
        companyId,
        purpose: 'company_logo',
        fileName: 'expired-logo.png',
        contentType: 'image/png',
        sizeBytes: 2048,
      },
      userId,
      trx,
    );

    await trx('upload_intents')
      .where('id', intent.data!.intentId)
      .update({
        expires_at: new Date(Date.now() - 60_000),
      });

    const finalized = await finalizeUploadIntent(
      {
        companyId,
        intentId: intent.data!.intentId,
      },
      userId,
      trx,
    );

    expect(finalized.success).toBe(false);
    expect(finalized.code).toBe(ErrorCode.CONFLICT);

    const expiredIntent = await trx('upload_intents')
      .select('status')
      .where('id', intent.data!.intentId)
      .first();

    expect(expiredIntent?.status).toBe('expired');
  });
});
