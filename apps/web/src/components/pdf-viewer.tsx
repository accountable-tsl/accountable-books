import { useEffect, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PDFViewerProps {
  url: string;
  fileName: string;
  className?: string;
}

export function PDFViewer({ url, className }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);

  useEffect(() => {
    setPageNumber(1);
  }, [url]);

  return (
    <div className={`flex h-full w-full flex-col ${className ?? ''}`}>
      {/* Scroll container */}
      <div className="flex w-full flex-1 justify-center overflow-y-auto">
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={
            <div className="p-4 text-sm text-gray-500">Loading PDF…</div>
          }
          error={
            <div className="p-4 text-center">
              <p className="text-sm text-red-600">Could not load PDF</p>
              <a
                href={url}
                download
                className="mt-2 inline-block text-sm text-blue-600 underline"
              >
                Download file
              </a>
            </div>
          }
        >
          <Page
            pageNumber={pageNumber}
            width={800}
            renderTextLayer
            renderAnnotationLayer
          />
        </Document>
      </div>

      {/* Pagination */}
      {numPages && numPages > 1 && (
        <div className="flex items-center justify-center gap-4 border-t p-2">
          <button
            type="button"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => p - 1)}
            className="rounded border px-3 py-1 text-sm disabled:opacity-40"
          >
            Prev
          </button>

          <span className="text-sm">
            {pageNumber} / {numPages}
          </span>

          <button
            type="button"
            disabled={pageNumber >= numPages}
            onClick={() => setPageNumber((p) => p + 1)}
            className="rounded border px-3 py-1 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
