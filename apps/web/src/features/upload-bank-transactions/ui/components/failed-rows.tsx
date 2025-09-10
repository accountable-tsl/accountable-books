type ErrorRow = {
  rowIndex: number;
  originalRow: Record<string, any>;
  errorMessages: string[];
};
export function FailedRowsDisplay({ errors }: { errors: ErrorRow[] }) {
  if (errors.length === 0) return null;

  return (
    <div className="max-h-[200px] overflow-y-auto bg-red-50 border border-red-200 rounded-md p-3 mt-4 text-sm">
      <h2 className="text-red-700 font-semibold mb-3">
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
              className="bg-white border border-red-100 rounded px-3 py-2 shadow-sm text-xs text-gray-800"
            >
              <div className="font-medium text-gray-500 mb-1">Row {rowIndex + 1}</div>

              <div className="flex flex-wrap gap-x-6 gap-y-1 mb-1">
                <div className="truncate">
                  <span className="font-semibold">Date:</span> <span>{String(date)}</span>
                </div>
                <div className="truncate">
                  <span className="font-semibold">Amount:</span> <span>{String(amount)}</span>
                </div>
                {payee && (
                  <div className="truncate">
                    <span className="font-semibold">Payee:</span> <span>{payee}</span>
                  </div>
                )}
                {description && (
                  <div className="truncate" title={description}>
                    <span className="font-semibold">Description:</span> <span>{description}</span>
                  </div>
                )}
              </div>

              <div className="text-red-600 truncate">{errorMessages.join('; ')}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
