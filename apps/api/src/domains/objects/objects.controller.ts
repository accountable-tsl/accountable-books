import { type Response } from 'express';

import { knexClient } from '../../db/knexClient.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  ErrorCode,
  errorResponse,
  getHttpStatusFromErrorCode,
} from '../../shared/utils/response.utils.js';
import {
  createUploadIntent,
  detachCompanyLogo,
  finalizeUploadIntent,
} from './file-uploads.service.js';
import { StorageService } from './objects.service.js';
import { type ObjectBucket } from './objects.types.js';
import { getTxnFiles, persistTxnFiles } from './txn-files/txn-files.service.js';

import type { AuthRequest } from '../../features/auth/auth.types.js';

// Attachment limits for transaction files
const TRANSACTION_FILE_LIMITS = {
  MAX_FILE_SIZE_MB: 10,
  MAX_FILES_PER_ENTRY: 5,
  MAX_TOTAL_SIZE_MB: 20,
} as const;

const TRANSACTION_FILE_LIMITS_BYTES = {
  MAX_FILE_SIZE_BYTES: TRANSACTION_FILE_LIMITS.MAX_FILE_SIZE_MB * 1024 * 1024,
  MAX_TOTAL_SIZE_BYTES: TRANSACTION_FILE_LIMITS.MAX_TOTAL_SIZE_MB * 1024 * 1024,
} as const;

export async function createUploadIntentController(
  req: AuthRequest,
  res: Response,
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json(errorResponse('Unauthorized'));
    }

    const result = await createUploadIntent(
      {
        ...req.body,
        companyId: String(req.params.companyId),
      },
      req.user.id,
    );

    return res.status(getHttpStatusFromErrorCode(result.code)).json(result);
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('Failed to create upload intent'));
  }
}

export async function finalizeUploadIntentController(
  req: AuthRequest,
  res: Response,
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json(errorResponse('Unauthorized'));
    }

    const result = await finalizeUploadIntent(
      {
        ...req.body,
        companyId: String(req.params.companyId),
      },
      req.user.id,
    );

    return res.status(getHttpStatusFromErrorCode(result.code)).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse('Failed to finalize upload'));
  }
}

export async function getPrivateFileDownloadUrlController(
  req: AuthRequest,
  res: Response,
) {
  if (!req.user?.id) return res.status(401).json(errorResponse('Unauthorized'));
  const { bucketType, fileKey, timeout } = req.query ?? {};

  if (isNaN(Number(timeout))) {
    return res.status(400).json(errorResponse('Invalid timeout'));
  }

  if (String(bucketType) !== 'txnFiles') {
    return res.status(400).json(
      errorResponse(
        'Signed download URLs are only available for private files',
        undefined,
        {
          code: ErrorCode.INVALID_INPUT,
        },
      ),
    );
  }

  try {
    const companyUuid =
      req.companyContext?.uuid ??
      (await getCompanyUUID(String(req.params.companyId)));
    const file = await knexClient('files')
      .select('id')
      .where({
        company_id: companyUuid,
        key: String(fileKey),
        is_deleted: false,
      })
      .first();

    if (!file) {
      return res.status(404).json(
        errorResponse('File not found for this company', undefined, {
          code: ErrorCode.NOT_FOUND,
        }),
      );
    }

    const downloadUrl = await StorageService.getDownloadPresignedUrl({
      bucketType: String(bucketType) as ObjectBucket,
      fileKey: String(fileKey),
      timeout: Number(timeout),
    });
    if ('success' in downloadUrl && !downloadUrl.success) {
      return res.status(400).json(downloadUrl);
    }
    return res.status(200).json(downloadUrl);
  } catch (error) {
    return res.status(500).json(errorResponse('Failed to get download URL'));
  }
}

export async function deleteCompanyLogoController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const result = await detachCompanyLogo({
      companyId: String(req.params.companyId),
    });

    return res.status(getHttpStatusFromErrorCode(result.code)).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse('Failed to remove company logo'));
  }
}

export async function uploadTxnFilesController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId || req.company?.id);

    const data = Array.isArray(req.body) ? req.body : [req.body];
    if (!data.length) {
      return res.status(400).json(errorResponse('No files uploaded'));
    }

    // Validate file size limits
    for (const file of data) {
      const sizeBytes = BigInt(file.size_bytes || 0);
      if (
        sizeBytes > BigInt(TRANSACTION_FILE_LIMITS_BYTES.MAX_FILE_SIZE_BYTES)
      ) {
        return res
          .status(400)
          .json(
            errorResponse(
              `File "${file.name}" exceeds ${TRANSACTION_FILE_LIMITS.MAX_FILE_SIZE_MB}MB limit (${Number(sizeBytes) / (1024 * 1024)}MB)`,
            ),
          );
      }
    }

    // Group files by entry_id to validate per-entry limits
    const filesByEntry = new Map<string | null, typeof data>();
    for (const file of data) {
      const entryId = file.entry_id || null;
      if (!filesByEntry.has(entryId)) {
        filesByEntry.set(entryId, []);
      }
      filesByEntry.get(entryId)!.push(file);
    }

    // Validate per-entry limits
    for (const [entryId, files] of filesByEntry.entries()) {
      // Check file count limit
      if (files.length > TRANSACTION_FILE_LIMITS.MAX_FILES_PER_ENTRY) {
        return res
          .status(400)
          .json(
            errorResponse(
              `Maximum ${TRANSACTION_FILE_LIMITS.MAX_FILES_PER_ENTRY} files allowed per entry. Attempted to upload ${files.length} files.`,
            ),
          );
      }

      // Check total size limit
      const totalSize = files.reduce(
        (sum, file) => sum + Number(BigInt(file.size_bytes || 0)),
        0,
      );
      if (totalSize > TRANSACTION_FILE_LIMITS_BYTES.MAX_TOTAL_SIZE_BYTES) {
        return res
          .status(400)
          .json(
            errorResponse(
              `Total file size exceeds ${TRANSACTION_FILE_LIMITS.MAX_TOTAL_SIZE_MB}MB limit per entry (${(totalSize / (1024 * 1024)).toFixed(2)}MB).`,
            ),
          );
      }
    }

    const result = await persistTxnFiles({
      data,
      companyId,
      userId,
    });

    return 'success' in result && result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('Failed to upload transaction files'));
  }
}

export async function getTxnFilesController(req: AuthRequest, res: Response) {
  if (!req.user?.id) {
    return res.status(401).json(errorResponse('Unauthorized'));
  }

  const data = Array.isArray(req.body) ? req.body : [req.body];
  if (!data.length) {
    return res.status(400).json(errorResponse('Empty requesst'));
  }

  try {
    const result = await getTxnFiles({
      data,
    });

    return 'success' in result && result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('Failed to get transaction files'));
  }
}
