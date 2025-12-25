import { z } from 'zod';

/**
 * Zod Enum for common MIME types.
 * For a full list, refer to the [MDN Common MIME types guide](developer.mozilla.org).
 */
export const mimeTypeEnum = z.enum([
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',

  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',

  // Video/Audio
  'video/mp4',
  'video/mpeg',
  'audio/mpeg',
  'audio/wav',

  // Archives
  'application/zip',
  'application/x-7z-compressed',
  'application/x-rar-compressed',

  // Data
  'application/json',
  'application/xml',
]);

export type MimeType = z.infer<typeof mimeTypeEnum> | string;
