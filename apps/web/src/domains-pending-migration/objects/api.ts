import type { ApiResponse } from '@/shared/types/core';
import {
  type ObjectType,
  type UploadParams,
} from '@/domains-pending-migration/objects/types';
import {
  buildFormData,
  objectTypeConfigs,
} from '@/domains-pending-migration/objects/utils';
import api from '@/lib/axios';

export const fetchLogoUrl = async (key: string) => {
  try {
    const response = await api.get(`/objects/logos/signed-url?key=${key}`);
    const { success, data } = response.data;
    if (success && data) {
      return data;
    }
    throw new Error('Signed URL failed');
  } catch (err: unknown) {
    console.error('Signed URL error:', err);
    return null;
  }
};

export async function uploadObject<T extends UploadParams>(
  objectType: ObjectType,
  params: T,
): Promise<ApiResponse<{ url: string; key: string }>> {
  const config = objectTypeConfigs[objectType];
  if (!config) {
    return {
      success: false,
      message: `Unsupported object type: ${objectType}`,
    };
  }

  const parsed = config.schema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      message: 'Invalid parameters',
      error: parsed.error.flatten(),
    };
  }

  const formData = buildFormData(params, objectType);

  try {
    const response = await api.post(config.uploadEndpoint, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    const { success, data, message } = response.data;
    if (success && data?.url && data?.key) {
      return {
        success: true,
        message,
        data: { url: data.url, key: data.key },
      };
    }
    return { success: false, message: message || 'Upload failed' };
  } catch (err: unknown) {
    return {
      success: false,
      message: err.message || 'Failed to upload file',
      error: err,
    };
  }
}

// Remove from object storage
export async function deleteObject(
  objectType: ObjectType,
  key: string,
): Promise<ApiResponse<null>> {
  const config = objectTypeConfigs[objectType];
  if (!config) {
    return {
      success: false,
      message: `Unsupported object type: ${objectType}`,
    };
  }

  try {
    const response = await api.delete(config.deleteEndpoint, {
      data: { key },
    });

    const { success, message } = response.data;
    if (success) {
      return { success: true, message, data: null };
    }
    return { success: false, message: message || 'Failed to remove file' };
  } catch (err: unknown) {
    return {
      success: false,
      message: err.message || 'Failed to remove file',
      error: err,
    };
  }
}
