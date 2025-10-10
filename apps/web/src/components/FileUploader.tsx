import * as React from 'react';
import Dropzone, {
  type DropzoneProps,
  type FileRejection,
} from 'react-dropzone';
import { toast } from 'sonner';
import { cn, formatBytes } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { FileTextIcon, UploadIcon, X } from 'lucide-react';
import { useControllableState } from '@/shared/hooks/useControllableState';
import { Image } from '@/components/ui/Image';
import {
  getSpreadsheetRowCount,
  isSpreadsheetFile,
} from '@/domains-pending-migration/spreadsheets/utils';

interface FileUploaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Value of the uploader.
   * @type File[]
   * @default undefined
   * @example value={files}
   */
  value?: File[];

  /**
   * Function to be called when the value changes.
   * @type (files: File[]) => void
   * @default undefined
   * @example onValueChange={(files) => setFiles(files)}
   */
  onValueChange?: (files: File[]) => void;

  /**
   * Function to be called when files are uploaded.
   * @type (files: File[]) => Promise<void>
   * @default undefined
   * @example onUpload={(files) => uploadFiles(files)}
   */
  onUpload?: (files: File[]) => Promise<void>;

  /**
   * Progress of the uploaded files.
   * @type Record<string, number> | undefined
   * @default undefined
   * @example progresses={{ "file1.png": 50 }}
   */
  progresses?: Record<string, number>;

  /**
   * Accepted file types for the uploader.
   * @type { [key: string]: string[]}
   * @default
   * ```ts
   * { "image/*": [] }
   * ```
   * @example accept={["image/png", "image/jpeg"]}
   */
  accept?: DropzoneProps['accept'];

  /**
   * Maximum file size for the uploader.
   * @type number | undefined
   * @default 1024 * 1024 * 2 // 2MB
   * @example maxSize={1024 * 1024 * 2} // 2MB
   */
  maxSize?: DropzoneProps['maxSize'];

  /**
   * Maximum number of files for the uploader.
   * @type number | undefined
   * @default 1
   * @example maxFileCount={4}
   */
  maxFileCount?: DropzoneProps['maxFiles'];

  /**
   * Whether the uploader should accept multiple files.
   * @type boolean
   * @default false
   * @example multiple
   */
  multiple?: boolean;

  /**
   * Whether the uploader is disabled.
   * @type boolean
   * @default false
   * @example disabled
   */
  disabled?: boolean;

  /**
   * Maximum number of rows if file is a CSV or other spreadsheet.
   * @type number | undefined
   * @default undefined
   */
  maxRows?: number;

  /**
   * Text to show the accepted file types.
   * @type string | undefined
   * @default undefined
   */
  acceptText?: string;

  showFileCard?: boolean;

  fileCardContainerClassName?: string;
  fileCardClassName?: string;
  fileCardContentClassName?: string;

  className?: string;
  uploaderClassName?: string;

  /**
   * Custom file card renderer.
   * If provided, this will be used to render each file in the file list.
   * @type (file: File, index: number, onRemove: () => void, progress?: number) => React.ReactNode
   * @default undefined
   * @example customFileCard={(file, index, onRemove, progress) => <MyCard file={file} onRemove={onRemove} progress={progress} />}
   */
  customFileCard?: (
    file: File,
    index: number,
    onRemove: () => void,
    progress?: number,
  ) => React.ReactNode;

  fileCardExtra?: (file?: File, idx?: number) => React.ReactNode;
  footer?: React.ReactNode;
  header?: React.ReactNode;
  summary?: (files: File[]) => React.ReactNode;
}

export function FileUploader(props: FileUploaderProps) {
  const {
    value: valueProp,
    onValueChange,
    onUpload,
    progresses,
    accept = {
      'image/*': [],
    },
    maxSize = 1024 * 1024 * 2,
    maxFileCount = 1,
    maxRows,
    multiple = false,
    disabled = false,
    className,
    uploaderClassName,
    acceptText,
    showFileCard = true,
    fileCardClassName,
    fileCardContentClassName,
    fileCardContainerClassName,
    customFileCard,
    fileCardExtra,
    footer,
    header,
    ...dropzoneProps
  } = props;

  const [files, setFiles] = useControllableState({
    prop: valueProp,
    onChange: onValueChange,
  });

  const onDrop = React.useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (!multiple && maxFileCount === 1 && acceptedFiles.length > 1) {
        toast.error('Cannot upload more than 1 file at a time');
        return;
      }

      if ((files?.length ?? 0) + acceptedFiles.length > maxFileCount) {
        toast.error(`Cannot upload more than ${maxFileCount} files`);
        return;
      }

      const newFiles = acceptedFiles.map((file) =>
        Object.assign(file, {
          preview: URL.createObjectURL(file),
        }),
      );

      const updatedFiles = files ? [...files, ...newFiles] : newFiles;

      setFiles(updatedFiles);

      if (rejectedFiles.length > 0) {
        rejectedFiles.forEach(({ file }) => {
          toast.error(`File ${file.name} was rejected`);
        });
      }

      if (
        onUpload &&
        updatedFiles.length > 0 &&
        updatedFiles.length <= maxFileCount
      ) {
        const target =
          updatedFiles.length > 0 ? `${updatedFiles.length} files` : `file`;

        toast.promise(onUpload(updatedFiles), {
          loading: `Uploading ${target}...`,
          success: () => {
            setFiles([]);
            return `${target} uploaded`;
          },
          error: `Failed to upload ${target}`,
        });
      }
    },

    [files, maxFileCount, multiple, onUpload, setFiles],
  );

  function onRemove(index: number) {
    if (!files) return;
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    onValueChange?.(newFiles);
  }

  // Revoke preview url when component unmounts
  React.useEffect(() => {
    return () => {
      if (!files) return;
      files.forEach((file) => {
        if (isFileWithPreview(file)) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, []);

  const isDisabled = disabled || (files?.length ?? 0) >= maxFileCount;

  return (
    <div
      className={cn(
        'relative flex flex-col h-full gap-6 justify-center min-w-0',
        className ?? '',
      )}
    >
      {header}
      <Dropzone
        onDrop={onDrop}
        accept={accept}
        maxSize={maxSize}
        maxFiles={maxFileCount}
        multiple={maxFileCount > 1 || multiple}
        disabled={isDisabled}
      >
        {({ getRootProps, getInputProps, isDragActive }) => (
          <div
            {...getRootProps()}
            className={cn(
              'group relative grid h-52 w-full cursor-pointer place-items-center rounded-lg border-2 border-dashed border-muted-foreground/25 px-5 py-2.5 text-center transition hover:bg-muted/25',
              'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isDragActive && 'border-muted-foreground/50',
              isDisabled && 'pointer-events-none opacity-60',
              uploaderClassName,
            )}
            {...dropzoneProps}
          >
            <input {...getInputProps()} />
            {isDragActive ? (
              <div className="flex flex-col items-center justify-center gap-4 sm:px-5">
                <div className="rounded-full border border-dashed p-3">
                  <UploadIcon
                    className="size-7 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <p className="font-medium text-muted-foreground">
                  Drop the files here
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 sm:px-5">
                <div className="rounded-full border border-dashed p-3">
                  <UploadIcon
                    className="size-7 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex flex-col gap-px">
                  <p className="font-medium text-muted-foreground">
                    Drag {`'n'`} drop files here, or click to select files
                  </p>
                  <p className="text-sm text-muted-foreground/70">
                    {acceptText && `Allowed file types: ${acceptText}`}
                    <br />
                    {maxFileCount > 1
                      ? `Upload up to ${maxFileCount} files (not exceeding ${formatBytes(
                          maxSize,
                        )} each)`
                      : `Max file size: ${formatBytes(maxSize)}`}
                    {maxRows && ` | Maximum rows: ${maxRows.toLocaleString()}.`}
                  </p>
                  {maxRows && (
                    <p className="text-sm text-muted-foreground/70"></p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Dropzone>
      {showFileCard && files?.length ? (
        <div
          className={cn(
            'flex flex-col gap-4 min-w-0 min-h-0 h-full w-full border border-t-0 rounded-b-md',
            'overflow-y-auto',
            fileCardContainerClassName,
          )}
        >
          {files?.map((file, index) =>
            customFileCard ? (
              <React.Fragment key={`${file.name}-${file.size}-${index}`}>
                {customFileCard(
                  file,
                  index,
                  () => onRemove(index),
                  progresses?.[file.name],
                )}
              </React.Fragment>
            ) : (
              <FileCard
                key={`${file.name}-${file.size}-${index}`}
                file={file}
                onRemove={() => onRemove(index)}
                progress={progresses?.[file.name]}
                className={fileCardClassName}
                contentClassName={cn(
                  fileCardContentClassName,
                  'min-w-0 w-full',
                )}
              >
                {props.fileCardExtra?.(file, index)}
              </FileCard>
            ),
          )}
        </div>
      ) : null}
      {footer}
    </div>
  );
}

export interface FileCardProps {
  file: File;
  onRemove: () => void;
  progress?: number;
  className?: string;
  children?: React.ReactNode;
  contentClassName?: string;
}

function FileCard({
  file,
  progress,
  onRemove,
  className,
  contentClassName,
  children,
}: FileCardProps) {
  const [rowCount, setRowCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    if (isSpreadsheetFile(file)) {
      getSpreadsheetRowCount(file)
        .then((count) => {
          if (!cancelled) {
            setRowCount(count);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setRowCount(null);
          }
        });
    } else {
      setRowCount(null);
    }

    return () => {
      cancelled = true;
    };
  }, [file]);
  return (
    <div className={cn('rounded-md py-4', className ?? '')}>
      <div
        className={cn('relative px-4 min-w-0 w-full', contentClassName ?? '')}
      >
        <div className="relative flex items-center gap-2.5">
          <div className="flex flex-1 gap-2.5">
            {isFileWithPreview(file) ? <FilePreview file={file} /> : null}
            <div className="flex w-full flex-col gap-2">
              <div className="flex flex-col gap-px">
                <p className="line-clamp-1 text-sm font-medium text-foreground/80">
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                  {rowCount !== null && (
                    <>
                      <span className="mx-1">•</span>
                      <span>
                        {rowCount.toLocaleString()} row
                        {rowCount === 1 ? '' : 's'}
                      </span>
                    </>
                  )}
                </p>
              </div>
              {progress ? <Progress value={progress} /> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7"
              onClick={onRemove}
            >
              <X className="size-4" aria-hidden="true" />
              <span className="sr-only">Remove file</span>
            </Button>
          </div>
        </div>

        {children && (
          <>
            <hr className="my-1" />

            {children}
          </>
        )}
      </div>
    </div>
  );
}

export function isFileWithPreview(
  file: File,
): file is File & { preview: string } {
  return 'preview' in file && typeof file.preview === 'string';
}

interface FilePreviewProps {
  file: File & { preview: string };
}

export function FilePreview({ file }: FilePreviewProps) {
  if (file.type.startsWith('image/')) {
    return (
      <Image
        src={file.preview}
        alt={file.name}
        width={48}
        height={48}
        loading="lazy"
        className="aspect-square shrink-0 rounded-md object-cover"
      />
    );
  }

  return (
    <FileTextIcon
      className="size-10 text-muted-foreground"
      aria-hidden="true"
    />
  );
}
