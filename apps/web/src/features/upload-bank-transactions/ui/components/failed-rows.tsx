type ErrorRow = {
  rowIndex: number;
  originalRow: Record<string, any>;
  errorMessages: string[];
};
export function FailedRowsDisplay({ errors }: { errors: ErrorRow[] }) {
  if (errors.length === 0) return null;

  return (
    <div className="mt-4 max-h-[200px] overflow-y-auto rounded-md border border-red-200 bg-red-50 p-3 text-sm">
      <h2 className="mb-3 font-semibold text-red-700">
        {errors.length} row{errors.length > 1 ? 's' : ''} failed to import
      </h2>

      <ul className="space-y-2">
        {errors.map(({ rowIndex, originalRow, errorMessages }) => {
          const date = originalRow.rawDate || originalRow.date || '';
          const amount = originalRow.amount ?? '';
          const payee = originalRow.payee || '';
          const description = originalRow.description || '';

          return (
            <li
              key={rowIndex}
              className="rounded border border-red-100 bg-white px-3 py-2 text-xs text-gray-800 shadow-sm"
            >
              <div className="mb-1 font-medium text-gray-500">
                Row {rowIndex + 1}
              </div>

              <div className="mb-1 flex flex-wrap gap-x-6 gap-y-1">
                <div className="truncate">
                  <span className="font-semibold">Date:</span>{' '}
                  <span>{String(date)}</span>
                </div>
                <div className="truncate">
                  <span className="font-semibold">Amount:</span>{' '}
                  <span>{String(amount)}</span>
                </div>
                {payee && (
                  <div className="truncate">
                    <span className="font-semibold">Payee:</span>{' '}
                    <span>{payee}</span>
                  </div>
                )}
                {description && (
                  <div className="truncate" title={description}>
                    <span className="font-semibold">Description:</span>{' '}
                    <span>{description}</span>
                  </div>
                )}
              </div>

              <div className="truncate text-red-600">
                {errorMessages.join('; ')}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
