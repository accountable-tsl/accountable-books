import type { ChangeEvent } from 'react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  type ImageUploaderProps,
  type ImageUploaderRef,
} from '@/domains-pending-migration/objects/types';
import { cn } from '@/lib/utils';
import { extractPath } from '@/shared/utils/formatting-utils';
import { Loader2, Upload, X } from 'lucide-react';

import { Button } from '../../components/ui/button';
import { matchesType } from './utils';

export const ImageUploader = forwardRef<ImageUploaderRef, ImageUploaderProps>(
  (
    {
      initialImage,
      onImageChange,
      onUpload,
      onRemove,
      onError, // Allow parent handle error e.g show toast etc
      validateFile,
      onUploadComplete,
      renderMetadata,

      className = '',
      size = 150,
      maxSizeMB = 0.5,
      accept = 'image/png,image/jpeg,image/jpg',
      showButtons = false,
      label,
      labelPosition = 'top',
      metadata = {},
      metadataToShow = ['size'],
    },
    ref,
  ) => {
    const [image, setImage] = useState<string | null>(initialImage || null);
    const [error, setError] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
    const [imageKey, setImageKey] = useState<string | null>(null);
    const [showMessage, setShowMessage] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const lastBlobUrl = useRef<string | null>(null);

    const inputId = useRef(
      `image-uploader-${Math.random().toString(36).substring(2, 9)}`,
    ).current;

    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    const maxSizeText =
      maxSizeBytes >= 1024 * 1024
        ? `${(maxSizeBytes / 1024 / 1024).toFixed(1)} MB`
        : `${Math.round(maxSizeBytes / 1024)} KB`;
    const errorMessage = (msg: string, fallback: string) =>
      msg && typeof msg === 'string' && msg.length > 30 ? msg : fallback;
    const defaultValidateFile = (file: File): string | null => {
      if (file.size > maxSizeBytes) {
        return `File size must be less than ${maxSizeText}`;
      }
      if (!accept.split(',').some((t) => matchesType(file.type, t))) {
        return `Invalid file type. Allowed: ${accept}`;
      }

      return null;
    };

    const revokeLastBlob = () => {
      if (lastBlobUrl.current?.startsWith('blob:')) {
        URL.revokeObjectURL(lastBlobUrl.current);
        lastBlobUrl.current = null;
      }
    };

    const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
      if (lastBlobUrl.current?.startsWith('blob:')) {
        URL.revokeObjectURL(lastBlobUrl.current); // release previous preview
      }

      const file = e.target.files?.[0];
      setError(null);
      setUploadedUrl(null);

      if (!file) {
        setImage(null);
        onImageChange?.(null);
        return;
      }

      // Validate file
      const validationError = validateFile
        ? validateFile(file)
        : defaultValidateFile(file);

      if (validationError) {
        setError(validationError);
        onError?.(validationError, 'upload');
        e.target.value = '';
        return;
      }

      // Create preview
      const imageUrl = URL.createObjectURL(file);
      lastBlobUrl.current = imageUrl;
      setImage(imageUrl);
      onImageChange?.(file);

      if (!showButtons && onUpload) {
        await handleUpload(file);
      }
    };

    const handleUpload = async (
      file: File,
    ): Promise<{ url: string; key?: string } | null> => {
      if (!onUpload) return null;
      setIsUploading(true);
      try {
        const result = await onUpload(file, metadata);
        if (result) {
          revokeLastBlob();
          setUploadedUrl(result.url);
          setImage(result.url);
          if (result.key) setImageKey(result.key);
          if (onUploadComplete) onUploadComplete(result);
          return result;
        }
      } catch (err: unknown) {
        const errorMsg = errorMessage(err?.message, 'Upload failed');
        setError(errorMsg);
        onError?.(errorMsg, 'upload');
      } finally {
        setIsUploading(false);
      }
      return null;
    };

    const handleRemove = async () => {
      if (!imageKey || !onRemove) {
        revokeLastBlob();
        setImage(null);
        setUploadedUrl(null);
        setImageKey(null);
        return;
      }

      try {
        setIsUploading(true);
        const key = imageKey || (image && extractPath(image));
        if (key) await onRemove(key);
        setUploadedUrl(null);
        setImage(null);
        setImageKey(null);
        onImageChange?.(null);
      } catch (err: unknown) {
        const errorMsg = errorMessage(err?.message, 'Failed to remove image');
        setError(errorMsg);
        onError?.(errorMsg, 'remove');
      } finally {
        setIsUploading(false);
      }
    };

    const triggerFileInput = () => {
      if (!isUploading && fileInputRef.current) {
        fileInputRef.current.click();
      }
    };

    useImperativeHandle(ref, () => ({
      reset: () => {
        revokeLastBlob();
        setImage(null);
        setUploadedUrl(null);
        setImageKey(null);
        onImageChange?.(null);
      },
      getImage: () => image,
      getKey: () => imageKey,
      upload: async (file: File) => {
        return await handleUpload(file);
      },
    }));

    useEffect(() => {
      if (error || uploadedUrl) {
        setShowMessage(true);
        const timeout = setTimeout(() => setShowMessage(false), 7500);
        return () => clearTimeout(timeout);
      } else {
        setShowMessage(false);
      }
    }, [error, uploadedUrl]);

    useEffect(() => {
      return () => {
        if (lastBlobUrl.current?.startsWith('blob:')) {
          URL.revokeObjectURL(lastBlobUrl.current);
        }
      };
    }, []);

    useEffect(() => {
      if (initialImage) {
        setImage(initialImage);
      }
    }, [initialImage]);

    const renderLabel = () => {
      if (!label) return null;

      return (
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
      );
    };

    const defaultRenderMetadata = () => (
      <p className="text-muted-foreground text-center text-xs">
        {getMetadataDisplay(metadata, metadataToShow, maxSizeText)}
      </p>
    );

    return (
      <div className={cn(`p-4, flex flex-col items-center gap-2 ${className}`)}>
        {labelPosition === 'top' && renderLabel()}

        <div
          className="relative"
          style={{ width: `${size}px`, height: `${size}px` }}
        >
          <div
            onClick={triggerFileInput}
            className={`bg-muted border-border relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 ${!isUploading ? 'hover:border-primary/50 cursor-pointer hover:opacity-90' : ''} transition-all duration-200`}
            role="button"
            tabIndex={0}
            aria-label="Upload profile image"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                triggerFileInput();
              }
            }}
          >
            {image ? (
              <div className="relative h-full w-full">
                <img
                  src={image || uploadedUrl || ''}
                  alt="Profile preview"
                  className="h-full w-full object-contain"
                  sizes={`${size}px`}
                  loading="lazy"
                />
                {!isUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-200 hover:opacity-100">
                    <Upload className="h-8 w-8 text-white" />
                  </div>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground flex flex-col items-center justify-center">
                <Upload size={size / 3} />
                <span className="mt-2 text-xs">Click to upload</span>
              </div>
            )}

            {isUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}

            {showMessage && (
              <div className="absolute left-1/2 w-full max-w-[200px] -translate-x-1/2">
                {error && (
                  <p className="text-destructive mt-1 text-center text-sm">
                    {error}
                  </p>
                )}

                {uploadedUrl && (
                  <div className="bg-muted w-full rounded-md p-2 text-center">
                    <p className="text-xs font-medium">
                      Uploaded successfully!
                    </p>
                    {/* <p className="text-xs break-all">{uploadedUrl}</p> */}
                  </div>
                )}
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept={accept}
            className="sr-only"
            onChange={handleImageChange}
            disabled={isUploading}
          />

          {image && (
            <Button
              variant="destructive"
              size="icon"
              className="absolute -top-2 -right-2 h-8 w-8 rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove();
              }}
              disabled={isUploading || !onRemove}
            >
              <X size={16} />
              <span className="sr-only">Remove image</span>
            </Button>
          )}
        </div>

        {labelPosition === 'bottom' && renderLabel()}

        {showButtons && (
          <div className="flex w-full max-w-[200px] flex-col items-center gap-2">
            <div className="flex w-full gap-2">
              <Button
                onClick={triggerFileInput}
                disabled={isUploading}
                className="flex-1"
              >
                {image ? 'Change Image' : 'Upload Image'}
              </Button>

              {image && !uploadedUrl && !isUploading && (
                <Button
                  onClick={() => {
                    if (fileInputRef.current?.files?.[0]) {
                      handleUpload(fileInputRef.current.files[0]);
                    }
                  }}
                  disabled={isUploading || !image}
                  className="flex-1"
                >
                  Upload
                </Button>
              )}
            </div>
          </div>
        )}

        {metadataToShow.length > 0 &&
          (renderMetadata
            ? renderMetadata(metadata, maxSizeText)
            : defaultRenderMetadata())}
      </div>
    );
  },
);

const getMetadataDisplay = (
  metadata: Record<string, any>,
  metadataToShow: string[],
  maxSizeText: string,
) => {
  const items = [];

  if (metadataToShow.some((key) => key.toLowerCase() === 'size')) {
    items.push(`Max size: ${maxSizeText}`);
  }

  metadataToShow.forEach((key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey !== 'size') {
      const matchingMetaKey = Object.keys(metadata).find(
        (metaKey) => metaKey.toLowerCase() === lowerKey,
      );
      if (
        matchingMetaKey &&
        metadata[matchingMetaKey] &&
        metadata[matchingMetaKey] !== ''
      ) {
        items.push(`${matchingMetaKey}: ${metadata[matchingMetaKey]}`);
      }
    }
  });

  return items.join(' • ');
};
