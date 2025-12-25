import { type Request, type Response } from 'express';

import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { deleteObject, uploadObject } from './objects.model.js';
import { type ObjectBucket } from './objects.types.js';
import { objectTypeHandlers } from './objects.utils.js';
import type { AuthRequest } from '../../features/auth/auth.types.js';
import { StorageService } from './objects.service.js';
import { persistTxnFiles } from './txn-files/txn-files.service.js';
export async function uploadObjectController(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json(errorResponse('No file uploaded'));
    }

    const objectType = (req.params.objectType ||
      req.body.objectType) as ObjectBucket;

    if (!objectType) {
      return res.status(400).json(errorResponse('Object type required'));
    }

    const handler = objectTypeHandlers[objectType as ObjectBucket];
    if (!handler) {
      return res.status(400).json(errorResponse('Unsupported object type'));
    }

    if (req.file.size > handler.maxSizeMB * 1024 * 1024) {
      return res
        .status(400)
        .json(errorResponse(`File size exceeds ${handler.maxSizeMB}MB limit`));
    }

    if (!handler.allowedMimeTypes.includes(req.file.mimetype)) {
      return res
        .status(400)
        .json(
          errorResponse(
            `Unsupported file type. Allowed: ${handler.allowedMimeTypes.join(', ')}`,
          ),
        );
    }

    const parsedParams = {
      companyId: req.body.companyId,
      objectType,
      file: req.file.buffer,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
    };

    const uploadResult = await uploadObject(objectType, parsedParams);

    if (!uploadResult.success) {
      return res
        .status(500)
        .json(errorResponse(uploadResult.message || 'Failed to store logo'));
    }

    return res
      .status(200)
      .json(successResponse('Logo uploaded', uploadResult.data));
  } catch (error: any) {
    console.error(error);
    return res
      .status(500)
      .json(errorResponse(`Upload failed - ${error.message}`));
  }
}

export async function deleteObjectController(req: Request, res: Response) {
  try {
    const objectType = req.params.objectType || req.body.objectType;
    const key = req.body.key;

    if (!objectType || !key) {
      return res.status(400).json(errorResponse('Missing objectType or key'));
    }

    if (!objectTypeHandlers[objectType as ObjectBucket]) {
      return res.status(400).json(errorResponse('Unsupported object type'));
    }

    const result = await deleteObject(objectType as ObjectBucket, key);

    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('Delete error:', err);
    return res.status(500).json(errorResponse('Failed to delete object', err));
  }
}

export async function getObjUploadUrl(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json(errorResponse('Unauthorized'));
    const companyId = String(req.params.companyId || req.company?.id);
    const { bucketType, fileName, contentType, folderContext } = req.body;

    const uploadInfo = await StorageService.getUploadPresignedUrl({
      bucketType,
      companyId,
      fileName,
      contentType,
      folderContext,
    });

    if ('success' in uploadInfo && !uploadInfo.success) {
      return res.status(400).json(uploadInfo);
    }

    return res.status(200).json(uploadInfo);
  } catch (error) {
    return res.status(500).json(errorResponse('Failed to get upload URL'));
  }
}

export async function getObjDownloadUrl(req: AuthRequest, res: Response) {
  if (!req.user?.id) return res.status(401).json(errorResponse('Unauthorized'));
  const { bucketType, fileKey, timeout } = req.query ?? {};

  if (isNaN(Number(timeout))) {
    return res.status(400).json(errorResponse('Invalid timeout'));
  }

  try {
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
