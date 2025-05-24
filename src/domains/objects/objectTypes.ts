export interface ImageUploaderProps {
  initialImage?: string;
  onImageChange?: (file: File | null) => void;
  onUpload?: (
    file: File,
    metadata?: Record<string, any>
  ) => Promise<{ url: string; key: string } | null>;
  onRemove?: (key: string) => Promise<void>;
  onError?: (error: string, context: "upload" | "remove") => void;
  validateFile?: (file: File) => string | null; // Custom validation
  onUploadComplete?: (result: { url: string; key?: string }) => void;
  renderMetadata?: (
    metadata: Record<string, any>,
    maxSizeText: string
  ) => JSX.Element;

  className?: string;
  size?: number;
  maxSizeMB?: number;
  accept?: string; // e.g., "image/*" or "image/png,image/jpeg"
  showButtons?: boolean;
  label?: string;
  labelPosition?: "top" | "bottom";
  metadata?: Record<string, any>; // Extra data for upload
  metadataToShow?: string[];
}

export interface ImageUploaderRef {
  reset: () => void;
  getImage: () => string | null;
  getKey: () => string | null;
  upload: (file: File) => Promise<{ url: string; key?: string } | null>;
}
