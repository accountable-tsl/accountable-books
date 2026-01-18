import { randomUUID } from 'crypto';
import { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { type ZodSchema } from 'zod';

import { ENV } from '../../config/env.js';
import { errorResponse } from '../../shared/utils/response.utils.js';
import type { ObjectBucket } from './objects.types.js';
import { logoUploadParams } from './objects.types.js';

export const imageFilter = (
  allowedTypes: string[] = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
  ],
) => {
  return (
    req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback,
  ) => {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  };
};

export const multerErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json(errorResponse('File too large, max 1MB'));
    }
    return res.status(400).json(errorResponse(err.message));
  }
  if (err.message === 'Unsupported file type') {
    return res.status(400).json(errorResponse('Unsupported file type'));
  }
  next(err);
};

export const createMulter = (maxSize: number = 1024 * 1024) => {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSize },
    // fileFilter: imageFilter(), // Now handled in controller
  });
};

export const objectTypeHandlers: Record<
  string,
  {
    schema: ZodSchema<any>;
    bucket: string;
    domainUrl: string;
    keyBuilder: (params: any) => string;
    allowedMimeTypes: string[];
    maxSizeMB: number;
  }
> = {
  logos: {
    schema: logoUploadParams,
    bucket: ENV.R2_LOGOS_BUCKET_NAME || 'logos', // Specific bucket for logos
    domainUrl: `${ENV.R2_LOGOS_DOMAIN}` || 'https://logos.getaccountable.com',
    keyBuilder: (params) => {
      const ext = params.originalFilename.split('.').pop() || 'obj';
      return `${params.companyId}-${randomUUID()}.${ext}`;
    },
    allowedMimeTypes: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/svg+xml',
    ],
    maxSizeMB: 1,
  },

  // future: doc, profile_picture, etc.
};
