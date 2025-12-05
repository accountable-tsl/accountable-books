import { type Request, type Response } from 'express';

import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { deleteObject, uploadObject } from './objects.model.js';
import { type ObjectType } from './objects.types.js';
import { objectTypeHandlers } from './objects.utils.js';
export async function uploadObjectController(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json(errorResponse('No file uploaded'));
    }

    const objectType = (req.params.objectType ||
      req.body.objectType) as ObjectType;

    if (!objectType) {
      return res.status(400).json(errorResponse('Object type required'));
    }

    const handler = objectTypeHandlers[objectType as ObjectType];
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

    if (!objectTypeHandlers[objectType as ObjectType]) {
      return res.status(400).json(errorResponse('Unsupported object type'));
    }

    const result = await deleteObject(objectType as ObjectType, key);

    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('Delete error:', err);
    return res.status(500).json(errorResponse('Failed to delete object', err));
  }
}
