import type { MimeType } from '@/shared/constants/filetype';
import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, X } from 'lucide-react';

import { PDFViewer } from './pdf-viewer';

interface FileAttachment {
  file_name: string;
  url: string; // The blob URL or S3 link
  type: MimeType; // MIME type: 'image/jpeg', 'application/pdf', etc.
  size?: number;
}

interface FilePreviewerProps {
  files: FileAttachment[];
  currentIndex: number | null;
  onClose: () => void;
  onNavigate: (newIndex: number) => void;
}
export function FilePreviewer({
  files,
  currentIndex,
  onClose,
  onNavigate,
}: FilePreviewerProps) {
  if (currentIndex === null) return null;

  const currentFile = files[currentIndex];
  const isImage = currentFile.type.startsWith('image/');
  const isPDF = currentFile.type === 'application/pdf';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && currentIndex < files.length - 1)
        onNavigate(currentIndex + 1);
      if (e.key === 'ArrowLeft' && currentIndex > 0)
        onNavigate(currentIndex - 1);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, files.length, onClose, onNavigate]);

  return (
    <div className="dark:bg-background/50 fixed inset-0 z-[100] flex h-screen flex-col overflow-hidden bg-black/50 backdrop-blur-sm duration-200 dark:backdrop-blur-md">
      {/* Header */}
      <div className="bg-background/50 flex h-16 flex-shrink-0 items-center justify-between p-4">
        <div className="flex flex-col">
          <h3 className="text-foreground text-sm font-medium">
            {currentFile.file_name}
          </h3>
          <p className="text-muted-foreground text-xs">
            {currentIndex + 1} of {files.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={currentFile.url}
            download
            className="text-muted-foreground hover:bg-muted rounded-full p-2 transition-colors"
            title="Download"
          >
            <Download className="h-5 w-5" />
          </a>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:bg-muted rounded-full p-2 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {/* Navigation Buttons */}
        {currentIndex > 0 && (
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            className="absolute left-6 z-10 rounded-full border bg-white p-3 shadow-sm transition-all hover:shadow-md active:scale-95"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {/* Content Container - scrollable with max size */}
        <div className="flex h-full w-full items-center justify-center overflow-auto px-20 py-8">
          {isImage ? (
            <img
              src={currentFile.url}
              alt={currentFile.file_name}
              className="h-auto max-h-full w-auto max-w-full object-contain shadow-2xl"
            />
          ) : isPDF ? (
            <div className="h-full w-full max-w-5xl">
              <PDFViewer
                url={currentFile.url}
                fileName={currentFile.file_name}
              />
            </div>
          ) : (
            <div className="bg-muted flex w-full max-w-md flex-col items-center rounded-2xl p-12 text-center">
              <div className="mb-4 rounded-2xl bg-white p-6 shadow-sm">
                <FileText className="text-primary h-12 w-12" />
              </div>
              <p className="font-medium">No preview available</p>
              <p className="text-muted-foreground mb-6 text-sm">
                Spreadsheets and zip files are better viewed locally.
              </p>
              <a
                href={currentFile.url}
                download
                className="bg-primary text-primary-foreground rounded-lg px-6 py-2 text-sm font-medium"
              >
                Download File
              </a>
            </div>
          )}
        </div>

        {currentIndex < files.length - 1 && (
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            className="absolute right-6 z-10 rounded-full border bg-white p-3 shadow-sm transition-all hover:shadow-md active:scale-95"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
}
