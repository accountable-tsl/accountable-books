import { randomUUID } from 'crypto';
import { type NextFunction, type Request, type Response } from 'express';
import { fileTypeFromBuffer } from 'file-type';
import multer from 'multer';
import { type ZodSchema } from 'zod';

import { ENV } from '../../config/env.js';
import { errorResponse } from '../../shared/utils/response.utils.js';
import { logoUploadParams } from './objects.types.js';

import type { ObjectBucket } from './objects.types.js';

const SVG_XML_PREFIXES = ['<?xml', '<svg'];
function looksLikeSvg(buffer: Buffer): boolean {
  const start =
    buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
      ? buffer.subarray(3)
      : buffer;
  const head = start.toString('utf8', 0, 200).trim().toLowerCase();
  return SVG_XML_PREFIXES.some((p) => head.startsWith(p));
}

/**
 * Validates file content by magic bytes (not client-reported MIME).
 * Returns detected mime or an error. Use this after multer so req.file.buffer is available.
 */
export async function validateFileMagicBytes(
  buffer: Buffer,
  allowedMimeTypes: string[],
): Promise<{ mime: string } | { error: string }> {
  if (!buffer.length) {
    return { error: 'Empty file' };
  }
  const type = await fileTypeFromBuffer(buffer);
  if (type) {
    if (allowedMimeTypes.includes(type.mime)) {
      return { mime: type.mime };
    }
    return {
      error: `Invalid file type. Allowed: ${allowedMimeTypes.join(', ')}`,
    };
  }
  if (allowedMimeTypes.includes('image/svg+xml') && looksLikeSvg(buffer)) {
    return { mime: 'image/svg+xml' };
  }
  return {
    error: `Invalid file type. Allowed: ${allowedMimeTypes.join(', ')}`,
  };
}

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
