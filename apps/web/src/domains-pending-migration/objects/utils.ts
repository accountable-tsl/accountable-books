import type { ObjectType, ObjectTypeConfig, UploadParams } from './types';
import { logoUploadParams, profilePictureUploadParams } from './types';

export const matchesType = (fileType: string, acceptType: string) => {
  // normalise “jpg” ↔ “jpeg” and wildcards like image/*
  const pattern =
    '^' + acceptType.trim().replace(/jpg$/i, 'jpeg').replace('*', '.*') + '$';
  return new RegExp(pattern, 'i').test(fileType);
};

export const objectTypeConfigs: Record<ObjectType, ObjectTypeConfig> = {
  logos: {
    schema: logoUploadParams,
    uploadEndpoint: '/api/logos/upload',
    deleteEndpoint: '/api/logos/delete',
  },
  profile_picture: {
    schema: profilePictureUploadParams,
    uploadEndpoint: '/api/profile-pictures/upload',
    deleteEndpoint: '/api/profile-pictures/delete',
  },
};

export const buildFormData = (
  params: UploadParams,
  objectType: ObjectType,
): FormData => {
  const formData = new FormData();
  formData.append('objectType', objectType);

  Object.entries(params).forEach(([key, value]) => {
    if (value instanceof File) {
      formData.append(key, value);
    } else if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  });

  return formData;
};
