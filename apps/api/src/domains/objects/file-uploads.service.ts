import type { Knex } from 'knex';
import z from 'zod';

import { ENV } from '../../config/env.js';
import { knexClient } from '../../db/knexClient.js';
import {
  ErrorCode,
  errorResponse,
  getCompanyUUID,
  successResponse,
} from '../../shared/utils/index.js';
import { BUCKET_NAME_MAP } from './objects.registry.js';
import { StorageService } from './objects.service.js';
import {
  createUploadIntentParams,
  finalizeUploadIntentParams,
} from './objects.types.js';
import { persistTxnFiles } from './txn-files/txn-files.service.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type {
  CreateUploadIntentResponse,
  FileRecord,
  FileUploadPurpose,
  FinalizeUploadIntentResponse,
  NewFileRecord,
  NewUploadIntentRecord,
  ObjStorageProvider,
  UploadIntentRecord,
} from './objects.types.js';

const UPLOAD_INTENT_TTL_SECONDS = 60 * 60;
const COMPANY_LOGO_MAX_BYTES = 1024 * 1024;
const TXN_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

function sanitizeFilename(fileName: string): string {
  return fileName
    .trim()
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 255);
}

function getPurposeBucket(purpose: FileUploadPurpose) {
  return purpose === 'company_logo'
    ? BUCKET_NAME_MAP.logos
    : BUCKET_NAME_MAP.txnFiles;
}

function getPurposeMaxBytes(purpose: FileUploadPurpose): number {
  return purpose === 'company_logo'
    ? COMPANY_LOGO_MAX_BYTES
    : TXN_ATTACHMENT_MAX_BYTES;
}

function assertIntentSizeAllowed(
  purpose: FileUploadPurpose,
  sizeBytes: number,
): ApiResponse<never> | null {
  if (sizeBytes > getPurposeMaxBytes(purpose)) {
    return errorResponse(
      purpose === 'company_logo'
        ? 'Company logo files must be 1MB or smaller'
        : 'Transaction attachment files must be 10MB or smaller',
      undefined,
      { code: ErrorCode.INVALID_INPUT },
    );
  }

  return null;
}

function buildFileKey(
  purpose: FileUploadPurpose,
  companyUuid: string,
  fileName: string,
  metadata?: UploadIntentRecord['metadata'],
): string {
  const safeName = sanitizeFilename(fileName) || 'file';

  if (purpose === 'company_logo') {
    return `${companyUuid}/company-logo/${crypto.randomUUID()}-${safeName}`;
  }

  const folderContext =
    metadata?.txnAttachment?.folderContext ??
    metadata?.txnAttachment?.transactionId ??
    'files';

  return `${companyUuid}/${folderContext}/${crypto.randomUUID()}-${safeName}`;
}

function buildFileUrl(
  bucketName: string,
  fileKey: string,
  purpose: FileUploadPurpose,
): string {
  if (purpose === 'company_logo') {
    const domain = String(ENV.R2_LOGOS_DOMAIN || '').replace(/\/+$/, '');
    if (!domain) {
      throw new Error('Missing R2 logos domain');
    }
    return `${domain}/${fileKey}`;
  }

  const endpoint = String(ENV.R2_ENDPOINT || '').replace(/\/+$/, '');
  if (!endpoint) {
    throw new Error('Missing R2 endpoint');
  }
  return `${endpoint}/${bucketName}/${fileKey}`;
}

async function upsertFileRecord(
  txn: Knex.Transaction,
  params: {
    companyId: string;
    userId: string;
    key: string;
    bucketName: string;
    url: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    checksum?: string | null;
    provider?: ObjStorageProvider;
  },
): Promise<FileRecord> {
  const fileRow: NewFileRecord = {
    name: params.fileName,
    key: params.key,
    bucket_name: params.bucketName,
    url: params.url,
    mime_type: params.contentType,
    size_bytes: params.sizeBytes,
    checksum: params.checksum ?? null,
    provider: params.provider ?? 'cloudflare_r2',
    region: null,
    endpoint: null,
    company_id: params.companyId,
    uploaded_by_id: params.userId,
  };

  const [file] = await txn('files')
    .insert(fileRow)
    .onConflict(['company_id', 'key'])
    .merge({
      name: txn.raw('EXCLUDED.name'),
      bucket_name: txn.raw('EXCLUDED.bucket_name'),
      url: txn.raw('EXCLUDED.url'),
      mime_type: txn.raw('EXCLUDED.mime_type'),
      size_bytes: txn.raw('EXCLUDED.size_bytes'),
      checksum: txn.raw('EXCLUDED.checksum'),
      provider: txn.raw('EXCLUDED.provider'),
      region: txn.raw('EXCLUDED.region'),
      endpoint: txn.raw('EXCLUDED.endpoint'),
      is_deleted: false,
      deleted_at: null,
      deleted_by_id: null,
    })
    .returning<FileRecord[]>('*');

  if (!file) {
    throw new Error('Failed to persist file record');
  }

  return file;
}

async function getIntentForFinalize(
  txn: Knex.Transaction,
  params: {
    companyId: string;
    intentId: string;
    userId: string;
  },
): Promise<ApiResponse<UploadIntentRecord> | UploadIntentRecord> {
  const intent = await txn('upload_intents')
    .where({
      id: params.intentId,
      company_id: params.companyId,
      requested_by_id: params.userId,
    })
    .first<UploadIntentRecord>();

  if (!intent) {
    return errorResponse('Upload intent not found', undefined, {
      code: ErrorCode.NOT_FOUND,
    });
  }

  if (intent.status !== 'pending') {
    return errorResponse('Upload intent is no longer usable', undefined, {
      code: ErrorCode.CONFLICT,
    });
  }

  if (new Date(intent.expires_at).getTime() <= Date.now()) {
    await txn('upload_intents')
      .where({ id: intent.id })
      .update({ status: 'expired' });

    return errorResponse('Upload intent has expired', undefined, {
      code: ErrorCode.CONFLICT,
    });
  }

  return intent;
}

export async function createUploadIntent(
  rawParams: unknown,
  userId: string,
  trx?: Knex.Transaction,
): Promise<ApiResponse<CreateUploadIntentResponse>> {
  const parsed = createUploadIntentParams.safeParse(rawParams);
  if (!parsed.success) {
    return errorResponse(
      'Invalid upload intent request',
      z.flattenError(parsed.error),
      {
        code: ErrorCode.INVALID_INPUT,
      },
    );
  }

  const sizeError = assertIntentSizeAllowed(
    parsed.data.purpose,
    parsed.data.sizeBytes,
  );
  if (sizeError) {
    return sizeError;
  }

  if (
    parsed.data.purpose === 'company_logo' &&
    !parsed.data.contentType.startsWith('image/')
  ) {
    return errorResponse('Company logos must be image files', undefined, {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  const run = async (
    txn: Knex.Transaction,
  ): Promise<ApiResponse<CreateUploadIntentResponse>> => {
    const companyUuid = await getCompanyUUID(parsed.data.companyId, txn);
    const purpose = parsed.data.purpose;
    const bucketName = getPurposeBucket(purpose);
    const fileKey = buildFileKey(
      purpose,
      companyUuid,
      parsed.data.fileName,
      parsed.data.metadata,
    );
    const url = buildFileUrl(bucketName, fileKey, purpose);

    const uploadUrlResult = await StorageService.getUploadPresignedUrl({
      companyId: parsed.data.companyId,
      bucketType: purpose === 'company_logo' ? 'logos' : 'txnFiles',
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      folderContext:
        purpose === 'txn_attachment'
          ? (parsed.data.metadata?.txnAttachment?.folderContext ??
            parsed.data.metadata?.txnAttachment?.transactionId)
          : 'company-logo',
      fileKey,
      trx: txn,
    });

    if ('success' in uploadUrlResult && !uploadUrlResult.success) {
      return errorResponse<CreateUploadIntentResponse>(
        uploadUrlResult.message || 'Failed to create upload intent',
        uploadUrlResult.error,
        { code: uploadUrlResult.code as ErrorCode | undefined },
      );
    }

    const presignedUpload = uploadUrlResult as { signedUrl: string };

    const expiresAt = new Date(Date.now() + UPLOAD_INTENT_TTL_SECONDS * 1000);

    const intentRow: NewUploadIntentRecord = {
      company_id: companyUuid,
      requested_by_id: userId,
      purpose,
      bucket_name: bucketName,
      file_key: fileKey,
      original_filename: parsed.data.fileName,
      content_type: parsed.data.contentType,
      size_bytes: parsed.data.sizeBytes,
      status: 'pending',
      metadata: parsed.data.metadata ?? null,
      expires_at: expiresAt,
    };

    const [intent] = await txn('upload_intents')
      .insert(intentRow)
      .returning<UploadIntentRecord[]>('*');

    if (!intent) {
      return errorResponse('Failed to create upload intent', undefined, {
        code: ErrorCode.DATABASE_ERROR,
      });
    }

    return successResponse('Upload intent created', {
      intentId: intent.id,
      purpose,
      uploadUrl: presignedUpload.signedUrl,
      fileKey,
      bucketName,
      url,
      expiresAt: expiresAt.toISOString(),
    });
  };

  try {
    return trx ? await run(trx) : await knexClient.transaction(run);
  } catch (error) {
    return errorResponse('Failed to create upload intent', error, {
      code: ErrorCode.GENERIC,
    });
  }
}

export async function finalizeUploadIntent(
  rawParams: unknown,
  userId: string,
  trx?: Knex.Transaction,
): Promise<ApiResponse<FinalizeUploadIntentResponse>> {
  const parsed = finalizeUploadIntentParams.safeParse(rawParams);
  if (!parsed.success) {
    return errorResponse(
      'Invalid finalize request',
      z.flattenError(parsed.error),
      {
        code: ErrorCode.INVALID_INPUT,
      },
    );
  }

  const run = async (
    txn: Knex.Transaction,
  ): Promise<ApiResponse<FinalizeUploadIntentResponse>> => {
    const companyUuid = await getCompanyUUID(parsed.data.companyId, txn);
    const intentResult = await getIntentForFinalize(txn, {
      companyId: companyUuid,
      intentId: parsed.data.intentId,
      userId,
    });

    if ('success' in intentResult && !intentResult.success) {
      return errorResponse<FinalizeUploadIntentResponse>(
        intentResult.message || 'Failed to finalize upload',
        intentResult.error,
        { code: intentResult.code as ErrorCode | undefined },
      );
    }

    const intent = intentResult as UploadIntentRecord;
    const fileUrl = buildFileUrl(
      intent.bucket_name,
      intent.file_key,
      intent.purpose,
    );
    const file = await upsertFileRecord(txn, {
      companyId: companyUuid,
      userId,
      key: intent.file_key,
      bucketName: intent.bucket_name,
      url: fileUrl,
      fileName: intent.original_filename,
      contentType: intent.content_type,
      sizeBytes: Number(intent.size_bytes),
      checksum: parsed.data.checksum ?? null,
    });

    if (intent.purpose === 'company_logo') {
      await txn('companies').where({ id: companyUuid }).update({
        logo_file_id: file.id,
      });
    }

    if (intent.purpose === 'txn_attachment') {
      const metadata = intent.metadata?.txnAttachment;
      if (metadata?.transactionId && metadata.source) {
        const persistResult = await persistTxnFiles({
          companyId: parsed.data.companyId,
          userId,
          data: [
            {
              name: file.name,
              key: file.key,
              bucket_name: file.bucket_name,
              url: file.url,
              type: file.mime_type,
              size_bytes: Number(file.size_bytes),
              checksum: file.checksum,
              provider: file.provider,
              region: file.region,
              endpoint: file.endpoint,
              source: metadata.source,
              transaction_id: metadata.transactionId,
              entry_id: metadata.entryId ?? null,
            },
          ],
          trx: txn,
        });

        if ('success' in persistResult && !persistResult.success) {
          return errorResponse<FinalizeUploadIntentResponse>(
            persistResult.message || 'Failed to finalize upload',
            persistResult.error,
            { code: persistResult.code as ErrorCode | undefined },
          );
        }
      }
    }

    await txn('upload_intents').where({ id: intent.id }).update({
      status: 'finalized',
      finalized_at: new Date(),
      consumed_at: new Date(),
    });

    return successResponse('Upload finalized', {
      fileId: file.id,
      purpose: intent.purpose,
      key: file.key,
      url: file.url,
    });
  };

  try {
    return trx ? await run(trx) : await knexClient.transaction(run);
  } catch (error) {
    return errorResponse('Failed to finalize upload', error, {
      code: ErrorCode.GENERIC,
    });
  }
}

export async function detachCompanyLogo(params: {
  companyId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<null>> {
  const run = async (txn: Knex.Transaction) => {
    const companyUuid = await getCompanyUUID(params.companyId, txn);

    await txn('companies').where({ id: companyUuid }).update({
      logo_file_id: null,
    });

    return successResponse('Company logo removed', null);
  };

  try {
    return params.trx
      ? await run(params.trx)
      : await knexClient.transaction(run);
  } catch (error) {
    return errorResponse('Failed to remove company logo', error, {
      code: ErrorCode.GENERIC,
    });
  }
}
