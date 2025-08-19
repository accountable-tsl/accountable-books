import { z } from 'zod';

export interface ImageUploaderProps {
  initialImage?: string | null;
  onImageChange?: (file: File | null) => void;
  onUpload?: (
    file: File,
    metadata?: Record<string, unknown>,
  ) => Promise<{ url: string; key: string } | null>;
  onRemove?: (key: string) => Promise<void>;
  onError?: (error: string, context: 'upload' | 'remove') => void;
  validateFile?: (file: File) => string | null; // Custom validation
  onUploadComplete?: (result: { url: string; key?: string }) => void;
  renderMetadata?: (metadata: Record<string, unknown>, maxSizeText: string) => JSX.Element;

  className?: string;
  size?: number;
  maxSizeMB?: number;
  accept?: string; // e.g., "image/*" or "image/png,image/jpeg"
  showButtons?: boolean;
  label?: string;
  labelPosition?: 'top' | 'bottom';
  metadata?: Record<string, unknown>; // Extra data for upload
  metadataToShow?: string[];
}

export interface ImageUploaderRef {
  reset: () => void;
  getImage: () => string | null;
  getKey: () => string | null;
  upload: (file: File) => Promise<{ url: string; key?: string } | null>;
}

export const logoUploadParams = z.object({
  file: z.instanceof(File),
  companyId: z.string().min(1, 'Company ID is required'),
});

export const profilePictureUploadParams = z.object({
  file: z.instanceof(File),
  userId: z.string().min(1, 'User ID is required'),
});

export type LogoUploadParams = z.infer<typeof logoUploadParams>;
export type ProfilePictureUploadParams = z.infer<typeof profilePictureUploadParams>;

export type UploadParams = LogoUploadParams | ProfilePictureUploadParams;

export const objectTypes = ['logos', 'profile_picture'] as const;
export type ObjectType = (typeof objectTypes)[number];

export interface ObjectTypeConfig {
  schema: z.ZodSchema<unknown>;
  uploadEndpoint: string;
  deleteEndpoint: string;
}
