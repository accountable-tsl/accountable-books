import {
  ChangeEvent,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Button } from "../../components/ui/button";
import { Loader2, Upload, X } from "lucide-react";
import { extractPath } from "@/shared/utils/formattingUtils";
import { ImageUploaderProps, ImageUploaderRef } from "./objectTypes";

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

      className = "",
      size = 150,
      maxSizeMB = 0.5,
      accept = "image/png,image/jpeg,image/jpg",
      showButtons = false,
      label,
      labelPosition = "top",
      metadata = {},
      metadataToShow = ["size"],
    },
    ref
  ) => {
    const [image, setImage] = useState<string | null>(initialImage || null);
    const [error, setError] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
    const [imageKey, setImageKey] = useState<string | null>(null);
    const [showMessage, setShowMessage] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const inputId = useRef(
      `image-uploader-${Math.random().toString(36).substring(2, 9)}`
    ).current;
    const maxSizeNum = maxSizeMB > 1 ? maxSizeMB : maxSizeMB * 1000;
    const maxSizeText = maxSizeMB > 1 ? `${maxSizeNum}MB` : `${maxSizeNum}KB`;
    const errorMessage = (msg: string, fallback: string) =>
      msg && typeof msg === "string" && msg.length > 30 ? msg : fallback;
    const defaultValidateFile = (file: File): string | null => {
      if (file.size > maxSizeMB * 1024 * 1024) {
        return `File size must be less than ${maxSizeText}`;
      }
      if (!accept.split(",").some((type) => file.type.match(type.trim()))) {
        return `Invalid file type. Allowed: ${accept}`;
      }
      return null;
    };

    const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
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
        onError?.(validationError, "upload");
        e.target.value = "";
        return;
      }

      // Create preview
      const imageUrl = URL.createObjectURL(file);
      setImage(imageUrl);
      onImageChange?.(file);

      if (!showButtons && onUpload) {
        await handleUpload(file);
      }
    };

    const handleUpload = async (
      file: File
    ): Promise<{ url: string; key?: string } | null> => {
      if (!onUpload) return null;
      setIsUploading(true);
      try {
        const result = await onUpload(file, metadata);
        if (result) {
          setUploadedUrl(result.url);
          setImage(result.url);
          if (result.key) setImageKey(result.key);
          if (onUploadComplete) onUploadComplete(result);
          return result;
        }
      } catch (err: any) {
        const errorMsg = errorMessage(err?.message, "Upload failed");
        setError(errorMsg);
        onError?.(errorMsg, "upload");
      } finally {
        setIsUploading(false);
      }
      return null;
    };

    const handleRemove = async () => {
      if (!imageKey || !onRemove) {
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
      } catch (err: any) {
        const errorMsg = errorMessage(err?.message, "Failed to remove image");
        setError(errorMsg);
        onError?.(errorMsg, "remove");
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

    const renderLabel = () => {
      if (!label) return null;

      return (
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
      );
    };

    const defaultRenderMetadata = () => (
      <p className="text-xs text-muted-foreground text-center">
        {getMetadataDisplay(metadata, metadataToShow, maxSizeText)}
      </p>
    );

    return (
      <div className={`flex flex-col items-center gap-2 p-4 ${className}`}>
        {labelPosition === "top" && renderLabel()}

        <div
          className="relative"
          style={{ width: `${size}px`, height: `${size}px` }}
        >
          <div
            onClick={triggerFileInput}
            className={`
            w-full h-full rounded-full overflow-hidden bg-muted flex items-center justify-center
            border-2 border-border relative
            ${
              !isUploading
                ? "cursor-pointer hover:opacity-90 hover:border-primary/50"
                : ""
            }
            transition-all duration-200
          `}
            role="button"
            tabIndex={0}
            aria-label="Upload profile image"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                triggerFileInput();
              }
            }}
          >
            {image ? (
              <div className="relative w-full h-full">
                <img
                  src={image || uploadedUrl || ""}
                  alt="Profile preview"
                  className="object-cover w-full h-full"
                  sizes={`${size}px`}
                  loading="lazy"
                />
                {!isUploading && (
                  <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                    <Upload className="w-8 h-8 text-white" />
                  </div>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground flex flex-col items-center justify-center">
                <Upload size={size / 3} />
                <span className="text-xs mt-2">Click to upload</span>
              </div>
            )}

            {isUploading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
            )}

            {showMessage && (
              <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-[200px]">
                {error && (
                  <p className="text-destructive text-sm mt-1 text-center">
                    {error}
                  </p>
                )}

                {uploadedUrl && (
                  <div className="p-2 text-center bg-muted rounded-md w-full">
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
              className="absolute -top-2 -right-2 rounded-full w-8 h-8"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove();
              }}
              disabled={isUploading || !onRemove || !imageKey}
            >
              <X size={16} />
              <span className="sr-only">Remove image</span>
            </Button>
          )}
        </div>

        {labelPosition === "bottom" && renderLabel()}

        {showButtons && (
          <div className="flex flex-col items-center gap-2 w-full max-w-[200px]">
            <div className="flex gap-2 w-full">
              <Button
                onClick={triggerFileInput}
                disabled={isUploading}
                className="flex-1"
              >
                {image ? "Change Image" : "Upload Image"}
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
  }
);

const getMetadataDisplay = (
  metadata: Record<string, any>,
  metadataToShow: string[],
  maxSizeText: string
) => {
  const items = [];

  if (metadataToShow.some((key) => key.toLowerCase() === "size")) {
    items.push(`Max size: ${maxSizeText}`);
  }

  metadataToShow.forEach((key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey !== "size") {
      const matchingMetaKey = Object.keys(metadata).find(
        (metaKey) => metaKey.toLowerCase() === lowerKey
      );
      if (
        matchingMetaKey &&
        metadata[matchingMetaKey] &&
        metadata[matchingMetaKey] !== ""
      ) {
        items.push(`${matchingMetaKey}: ${metadata[matchingMetaKey]}`);
      }
    }
  });

  return items.join(" • ");
};
