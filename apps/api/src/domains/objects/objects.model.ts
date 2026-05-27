import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { r2Client } from '../../lib/r2Client.js';
import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { type ObjectBucket } from './objects.types.js';
import { objectTypeHandlers } from './objects.utils.js';

import type { ApiResponse } from '../../core/types/api.types.js';

export async function uploadObject(
  objectType: string = 'logos',
  params: any,
  client?: S3Client,
): Promise<ApiResponse> {
  const s3: S3Client = client ?? r2Client;

  // Find handler for object type
  const handler = objectTypeHandlers[objectType];
  if (!handler) return errorResponse('Unsupported object type', null);

  // Validate params with Zod
  const parsed = handler.schema.safeParse(params);
  if (!parsed.success)
    return errorResponse('Invalid parameters', parsed.error.flatten());

  const { file, mimeType } = parsed.data;
  const key = handler.keyBuilder(parsed.data);
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: handler.bucket,
        Key: key,
        Body: file,
        ContentType: mimeType,
        ContentDisposition: `inline; filename="${encodeURIComponent(key)}"`,
      }),
    );

    const url = `${handler.domainUrl}/${key}`;

    return successResponse(`Object uploaded - ${handler.bucket}`, { key, url });
  } catch (error) {
    return errorResponse(`Failed to upload object  - ${handler.bucket}`, error);
  }
}

export async function deleteObject(
  objectType: ObjectBucket,
  key: string,
  client?: S3Client,
): Promise<ApiResponse> {
  const s3: S3Client = client ?? r2Client;

  const handler = objectTypeHandlers[objectType];
  if (!handler) {
    return errorResponse('Unsupported object type');
  }

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: handler.bucket,
        Key: key,
      }),
    );

    return successResponse('Object deleted', null);
  } catch (error) {
    return errorResponse('Failed to delete object', error);
  }
}

// Generate presigned URL
export async function getPresignedUrl(objectType: ObjectBucket, key: string) {
  const handler = objectTypeHandlers[objectType];
  if (!handler) {
    return errorResponse('Unsupported object type');
  }
}
