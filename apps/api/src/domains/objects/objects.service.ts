import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  errorResponse,
  getCompanyUUID,
  successResponse,
} from '../../shared/index.js';
import { BUCKET_NAME_MAP } from './objects.registry.js';
import { r2Client } from '../../lib/r2Client.js';
import type { Knex } from 'knex';
import { knexClient } from '../../db/knexClient.js';
import type { ApiResponse } from '../../core/index.js';
import {
  objectBucket,
  objectUploadUrlParams,
  type ObjectUploadUrlParams,
  type ObjectBucket,
  type ObjectUploadUrlResponse,
  objectDownloadUrlParams,
} from './objects.types.js';

export const StorageService = {
  /**
   * Generates a signed URL for client-side PUT upload
   */
  async getUploadPresignedUrl(
    p: ObjectUploadUrlParams & { trx?: Knex.Transaction },
  ): Promise<ObjectUploadUrlResponse | ApiResponse<ObjectUploadUrlResponse>> {
    const trx = p?.trx;
    const exec = async (txn: Knex.Transaction) => {
      const v = objectUploadUrlParams.safeParse(p);
      if (!v.success) {
        throw new Error(v.error.message);
      }

      const {
        bucketType,
        companyId,
        fileName,
        contentType,
        folderContext, // Optional: context like transactionId for nested folders
      } = v.data;

      const companyUUID = await getCompanyUUID(companyId, txn);
      if (!companyUUID) {
        throw new Error('Something went wrong');
      }

      const bucket = BUCKET_NAME_MAP[bucketType];

      // Path structure: {companyId}/{optionalContext}/{uuid}-{fileName}
      const contextPath = folderContext ? `${folderContext}/` : '';
      const fileKey = `${companyUUID}/${contextPath}${crypto.randomUUID()}-${fileName}`;

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: fileKey,
        ContentType: contentType,
      });

      const signedUrl = await getSignedUrl(r2Client, command, {
        expiresIn: 3600,
      });

      if (!signedUrl) {
        throw new Error('Failed to generate signed URL');
      }

      return {
        signedUrl,
        fileKey,
        bucketName: bucket,
      };
    };

    try {
      if (trx) {
        return await exec(trx);
      } else {
        const res = await knexClient.transaction(exec);
        return successResponse('Signed URL generated', res);
      }
    } catch (error: unknown) {
      if (trx) {
        throw new Error(
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
      return errorResponse('Failed to generate signed URL', error);
    }
  },

  /**
   * Generates a signed URL for private file viewing (GET)
   */
  async getDownloadPresignedUrl(p: {
    bucketType: ObjectBucket;
    fileKey: string;
    timeout: number;
  }): Promise<ApiResponse<{ url: string; expiry: number }>> {
    const v = objectDownloadUrlParams.safeParse(p);

    if (!v.success) {
      return errorResponse('Invalid bucket type');
    }

    const { bucketType, fileKey, timeout = 3600 } = v.data;

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME_MAP[bucketType],
      Key: fileKey,
    });

    const expiry = Math.min(timeout, 3600);
    const url = await getSignedUrl(r2Client, command, {
      expiresIn: Math.min(timeout, 3600),
    });

    return successResponse('Signed URL generated', { url, expiry });
  },
};
