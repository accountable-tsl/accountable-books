import type { MimeType } from '@/shared/constants/filetype';
import { ChevronLeft, ChevronRight, Download, FileText, X } from 'lucide-react';
import { useEffect } from 'react';

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

  // Keyboard Navigation
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
    <div className="fixed inset-0 z-[100] flex flex-col bg-white/95 backdrop-blur-md animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex flex-col">
          <h3 className="text-sm font-medium text-foreground">
            {currentFile.file_name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {currentIndex + 1} of {files.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={currentFile.url}
            download
            className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </a>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative flex items-center justify-center p-8">
        {/* Navigation Buttons */}
        {currentIndex > 0 && (
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            className="absolute left-6 z-10 p-3 bg-white border shadow-sm hover:shadow-md rounded-full transition-all active:scale-95"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <div className="w-full h-full flex items-center justify-center max-w-5xl overflow-hidden rounded-lg">
          {isImage ? (
            <img
              src={currentFile.url}
              alt={currentFile.file_name}
              className="max-h-full max-w-full object-contain shadow-2xl"
            />
          ) : isPDF ? (
            <iframe
              src={`${currentFile.url}#toolbar=0`}
              className="w-full h-full border-none shadow-2xl"
              title="PDF Preview"
            />
          ) : (
            <div className="bg-muted w-full max-w-md p-12 rounded-2xl flex flex-col items-center text-center">
              <div className="bg-white p-6 rounded-2xl shadow-sm mb-4">
                <FileText className="w-12 h-12 text-primary" />
              </div>
              <p className="font-medium">No preview available</p>
              <p className="text-sm text-muted-foreground mb-6">
                Spreadsheets and zip files are better viewed locally.
              </p>
              <a
                href={currentFile.url}
                download
                className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium"
              >
                Download File
              </a>
            </div>
          )}
        </div>

        {currentIndex < files.length - 1 && (
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            className="absolute right-6 z-10 p-3 bg-white border shadow-sm hover:shadow-md rounded-full transition-all active:scale-95"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
}
