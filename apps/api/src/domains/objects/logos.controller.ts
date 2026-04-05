import { type Request, type Response } from 'express';

import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { getSignedLogoUrl, removeLogo, uploadLogo } from './logos.model.js';
import { validateFileMagicBytes } from './objects.utils.js';

export async function uploadLogoController(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json(errorResponse('No file uploaded'));
    }
    const { companyId } = req.body;
    if (!companyId) {
      return res.status(400).json(errorResponse('Company ID required'));
    }
    // Validate file size (500KB–1MB)
    if (req.file.size > 1024 * 1024) {
      return res.status(400).json(errorResponse('File size exceeds 1MB'));
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    const magicResult = await validateFileMagicBytes(
      req.file.buffer,
      allowedTypes,
    );
    if ('error' in magicResult) {
      return res
        .status(400)
        .json(errorResponse('Unsupported file type, upload PNG, JPEG or WEBP'));
    }

    const file = req.file.buffer;
    const uploadResult = await uploadLogo({
      file,
      originalFilename: req.file.originalname,
      mimeType: magicResult.mime,
      companyId,
    });

    if (!uploadResult.success || !uploadResult.data) {
      return res
        .status(500)
        .json(errorResponse(uploadResult.message || 'Failed to store logo'));
    }
    const signedUrlResult = await getSignedLogoUrl(uploadResult.data);
    if (!signedUrlResult.success || !signedUrlResult.data) {
      return res
        .status(500)
        .json(
          errorResponse(
            signedUrlResult.message || 'Failed to generate access URL',
          ),
        );
    }

    return res.status(200).json(
      successResponse('Logo uploaded', {
        url: signedUrlResult.data,
        key: uploadResult.data,
      }),
    );
  } catch (error: any) {
    console.error(error);
    return res
      .status(500)
      .json(errorResponse(`Upload failed - ${error.message}`));
  }
}

export async function removeLogoController(req: Request, res: Response) {
  try {
    const { key } = req.body;
    if (!key) {
      return res.status(400).json(errorResponse('Key required'));
    }

    const removeResult = await removeLogo(key);
    if (!removeResult.success) {
      return res
        .status(500)
        .json(errorResponse(removeResult.message || 'Failed to remove logo'));
    }

    return res.status(200).json(successResponse('Logo removed', null));
  } catch (error: any) {
    console.error(error);
    return res
      .status(500)
      .json(errorResponse(`Remove failed - ${error.message}`));
  }
}

export async function signedLogoUrlController(req: Request, res: Response) {
  try {
    const { key } = req.query;
    if (typeof key !== 'string') {
      return res.status(400).json(errorResponse('Key required'));
    }

    const signedUrlResult = await getSignedLogoUrl(key);
    if (!signedUrlResult.success || !signedUrlResult.data) {
      return res
        .status(500)
        .json(
          errorResponse(
            signedUrlResult.message || 'Failed to generate signed URL',
          ),
        );
    }

    return res
      .status(200)
      .json(successResponse('Signed URL generated', signedUrlResult.data));
  } catch (error: any) {
    console.error(error);
    return res
      .status(500)
      .json(errorResponse(`Signed URL generation failed - ${error.message}`));
  }
}
