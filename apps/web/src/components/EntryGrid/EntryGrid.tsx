import { X } from 'lucide-react';
import './EntryGrid.scss';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import numeral from 'numeral';
import DatePlaceholderInput, {
  usePlaceholderInput,
} from '../DatePlaceholderInput/DatePlaceholderInput';

export type EntryGridOption = {
  value: string;
  label: string;
};

export enum EntryGridColumnInputType {
  TEXT = 'text',
  DROPDOWN = 'dropdown',
  AMOUNT = 'amount',
}

export type ColumnConfig =
  | {
      key: string;
      label: string;
      inputType: EntryGridColumnInputType.TEXT;
      hasDatePlaceholder?: boolean;
    }
  | {
      key: string;
      label: string;
      inputType: EntryGridColumnInputType.DROPDOWN;
      options?: EntryGridOption[];
    }
  | {
      key: string;
      label: string;
      inputType: EntryGridColumnInputType.AMOUNT;
      exclusiveWith?: string;
    };

export type RowData = {
  [key: string]: string | EntryGridOption | null;
};

interface CustomClassNames {
  root?: string;

  row?: string;
  headerRow?: string;

  cell?: string;
  headerCell?: string;

  dropdownCell?: string;
  amountCell?: string;

  input?: string;
  textInput?: string;
  dropdown?: string;
  dropdownSelect?: string;
  dropdownOption?: string;

  deleteCell?: string;
  deleteCellHeader?: string;
  deleteCellBody?: string;
  deleteButton?: string;

  addButton?: string;

  footer?: string;
}
interface EntryGridProps {
  columns: ColumnConfig[];
  initialRows?: number;
  showDeleteIconPerRow?: boolean;
  onChange?: (rows: RowData[]) => void;
  customClassNames?: CustomClassNames;

  data?: RowData[];
  isEditable?: boolean;
  onToggleEdit?: () => void;
}

const EntryGrid: React.FC<EntryGridProps> = ({
  columns,
  initialRows = 4,
  showDeleteIconPerRow = false,
  onChange,
  customClassNames,

  data = [],
  isEditable = false,
}) => {
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const setInputRef = (rowIndex: number, colKey: string) => (el: HTMLInputElement | null) => {
    if (el) {
      inputRefs.current[`${rowIndex}-${colKey}`] = el;
    }
  };
  const createEmptyRow = useCallback((): RowData => {
    const row: RowData = {};
    columns.forEach((col) => {
      row[col.key] = col.inputType === 'text' ? '' : null;
    });
    return row;
  }, [columns]);

  // In editable mode, we manage rows internally.
  const [rows, setRows] = useState<RowData[]>(() => {
    if (isEditable) {
      if (data && data.length > 0) {
        return [...data, createEmptyRow()];
      } else {
        return [...Array.from({ length: initialRows }, createEmptyRow), createEmptyRow()];
      }
    }

    return [];
  });
  const [hasHydrated, setHasHydrated] = useState(false);

  // Check if a row is completely empty (i.e., all cells have default values)
  const isRowEmpty = useCallback(
    (row: RowData): boolean => {
      return columns.every((col) => {
        const value = row[col.key];
        return col.inputType === 'text' ? value === '' : value === null;
      });
    },
    [columns],
  );

  // Handle change in a cell
  const handleCellChange = useCallback(
    (rowIndex: number, colKey: string, value: string | EntryGridOption | null) => {
      setRows((prevRows) => {
        const newRows = [...prevRows];
        newRows[rowIndex] = { ...newRows[rowIndex], [colKey]: value };

        // If editing the last row (the extra row) and it becomes non-empty, append a new empty row.
        if (rowIndex === newRows.length - 1 && !isRowEmpty(newRows[rowIndex])) {
          newRows.push(createEmptyRow());
        }
        // Call onChange with all rows except the extra empty row.
        setTimeout(() => {
          onChange?.(newRows.filter((r, i) => i !== newRows.length - 1 || !isRowEmpty(r)));
        }, 0);

        return newRows;
      });
    },
    [isRowEmpty, onChange],
  );

  const handleAmountChange = (rowIndex: number, colKey: string, value: string) => {
    const sanitizedValue = value.replace(/[^0-9.]/g, '');

    const currentColumn = columns.find((col) => col.key === colKey);
    if (
      currentColumn?.inputType === EntryGridColumnInputType.AMOUNT &&
      currentColumn.exclusiveWith &&
      sanitizedValue !== '' &&
      rows[rowIndex]?.[currentColumn.exclusiveWith] !== ''
      // Only clear the other column if a value is being entered
    ) {
      setRows((prevRows) => {
        const newRows = [...prevRows];
        // Only clear the other column if we're adding a value to this column
        newRows[rowIndex] = {
          ...newRows[rowIndex],
          [colKey]: sanitizedValue,
          [currentColumn.exclusiveWith as string]: '',
        };

        // Handle the empty row logic
        if (rowIndex === newRows.length - 1 && !isRowEmpty(newRows[rowIndex])) {
          newRows.push(createEmptyRow());
        }

        // Notify parent component
        setTimeout(() => {
          onChange?.(newRows.filter((r, i) => i !== newRows.length - 1 || !isRowEmpty(r)));
        }, 0);

        return newRows;
      });
    } else {
      handleCellChange(rowIndex, colKey, sanitizedValue);
    }
  };

  const onAmountBlur = (rowIndex: number, colKey: string, value: string) => {
    const sanitized = value.replace(/[^0-9.]/g, '');
    const formatted = sanitized ? numeral(sanitized).format('0,0.00') : '';
    handleCellChange(rowIndex, colKey, formatted);
  };

  const handleAddRow = useCallback(() => {
    setRows((prev) => {
      const newRows = [...prev];
      newRows.splice(newRows.length - 1, 0, createEmptyRow());
      setTimeout(() => {
        onChange?.(newRows.slice(0, -1));
      }, 0);
      return newRows;
    });
  }, [onChange]);

  const handleDeleteRow = useCallback(
    (rowIndex: number) => {
      setRows((prev) => {
        const tempRows = prev.filter((_, i) => i !== rowIndex);
        const finalRows = isRowEmpty(tempRows[tempRows.length - 1])
          ? tempRows
          : [...tempRows, createEmptyRow()];

        // Filter out trailing empty row before notifying parent
        const notifyRows = finalRows.slice(0, -1);

        setTimeout(() => {
          onChange?.(notifyRows);
        }, 0);

        return finalRows;
      });
    },
    [isRowEmpty, onChange],
  );

  useEffect(() => {
    if (!isEditable) return;

    if (!hasHydrated) {
      if (data && data.length > 0) {
        setRows([...data, createEmptyRow()]);
      } else {
        setRows([...Array.from({ length: initialRows }, createEmptyRow), createEmptyRow()]);
      }
      setHasHydrated(true);
    }
  }, [isEditable, data, initialRows, createEmptyRow, hasHydrated]);

  const rowsToRender: RowData[] = isEditable ? rows : data;

  return (
    <div className={`entry-grid ${customClassNames?.root || ''}`}>
      <div className={`entry-grid-header`}>
        <div
          className={`entry-grid-row ${
            customClassNames?.row || ''
          } entry-grid-row__header ${customClassNames?.headerRow || ''}`}
          role="row"
        >
          {columns.map((column) => (
            <div
              key={column.key}
              className={`entry-grid-cell ${customClassNames?.cell || ''} ${
                customClassNames?.headerCell || ''
              } entry-grid-cell__header ${customClassNames?.root}__${column.key}`}
            >
              {column.label}
            </div>
          ))}

          {isEditable && showDeleteIconPerRow && (
            <div
              className={`entry-grid-cell ${customClassNames?.cell || ''} entry-grid-cell__delete ${
                customClassNames?.deleteCell || ''
              } entry-grid-cell__delete-header ${customClassNames?.deleteCellHeader || ''}`}
            ></div>
          )}
        </div>
      </div>
      <div className={`entry-grid-body`}>
        {rowsToRender.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className={`entry-grid-row entry-grid-body__row ${customClassNames?.row || ''}`}
          >
            {columns.map((column) => {
              if (isEditable) {
                if (column.inputType === EntryGridColumnInputType.DROPDOWN) {
                  const cellValue = row[column.key];
                  let selectedValue = '';
                  if (typeof cellValue === 'string') {
                    const foundOption = column.options?.find(
                      (opt) => opt.label === cellValue || opt.value === cellValue,
                    );
                    selectedValue = foundOption ? foundOption.value : '';
                  } else {
                    selectedValue = (cellValue as { value: string })?.value || '';
                  }

                  return (
                    <div
                      key={column.key}
                      className={`entry-grid-cell ${
                        customClassNames?.cell || ''
                      } entry-grid-cell__dropdown ${
                        customClassNames?.dropdownCell || ''
                      } ${customClassNames?.root}__${column.key}`}
                    >
                      <select
                        className={`entry-grid-cell__input ${
                          customClassNames?.input || ''
                        } entry-grid-cell__input-dropdown ${
                          customClassNames?.dropdownSelect || ''
                        }`}
                        value={(row[column.key] as { value: string })?.value || ''}
                        onChange={(e) => {
                          const option = column.options?.find(
                            (opt) => opt.value === e.target.value,
                          );
                          option && handleCellChange(rowIndex, column.key, option);
                        }}
                      >
                        <option
                          value=""
                          disabled
                          defaultValue={''}
                          hidden
                          className={`entry-grid-cell__dropdown-option ${
                            customClassNames?.dropdownOption || ''
                          }`}
                        ></option>
                        {column.options?.map((option, index) => (
                          <option
                            key={index}
                            value={option.value}
                            className={`entry-grid-cell__dropdown-option ${
                              customClassNames?.dropdownOption || ''
                            }`}
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }

                if (column.inputType === EntryGridColumnInputType.AMOUNT) {
                  return (
                    <div
                      key={column.key}
                      className={`entry-grid-cell ${
                        customClassNames?.cell || ''
                      } entry-grid-cell__text ${customClassNames?.root}__${column.key}`}
                    >
                      <input
                        className={`entry-grid-cell__input ${
                          customClassNames?.input || ''
                        } entry-grid-cell__input-text ${customClassNames?.textInput || ''}`}
                        type="text"
                        inputMode="decimal"
                        value={row[column.key]?.toString() || ''}
                        onChange={(e) => handleAmountChange(rowIndex, column.key, e.target.value)}
                        onBlur={(e) => onAmountBlur(rowIndex, column.key, e.target.value)}
                      />
                    </div>
                  );
                }

                if (
                  column.inputType === EntryGridColumnInputType.TEXT &&
                  column.hasDatePlaceholder
                ) {
                  return (
                    <PlaceholderInputCell
                      key={column.key}
                      column={column}
                      row={row}
                      rowIndex={rowIndex}
                      handleCellChange={handleCellChange}
                      inputRefs={inputRefs}
                      customClassNames={customClassNames}
                    />
                  );
                }

                if (column.inputType === EntryGridColumnInputType.TEXT) {
                  return (
                    <div
                      key={column.key}
                      className={`entry-grid-cell ${
                        customClassNames?.cell || ''
                      } entry-grid-cell__text ${customClassNames?.root}__${column.key}`}
                    >
                      <input
                        ref={setInputRef(rowIndex, column.key)}
                        className={`entry-grid-cell__input ${
                          customClassNames?.input || ''
                        } entry-grid-cell__input-text ${
                          customClassNames?.textInput || ''
                        } ${customClassNames?.root}__${column.key}`}
                        type="text"
                        value={row[column.key]?.toString() || ''}
                        onChange={(e) => handleCellChange(rowIndex, column.key, e.target.value)}
                      />
                    </div>
                  );
                }

                return null;
              } else {
                //View mode: Render formmatted value only
                if (column.inputType === EntryGridColumnInputType.DROPDOWN) {
                  const option = row[column.key] as EntryGridOption | null;
                  return (
                    <div
                      key={column.key}
                      className={`entry-grid-cell ${
                        customClassNames?.cell || ''
                      } ${customClassNames?.root}__${column.key}`}
                    >
                      {option ? option.label : ''}
                    </div>
                  );
                }

                if (column.inputType === EntryGridColumnInputType.AMOUNT) {
                  const val = row[column.key] ? row[column.key]?.toString() : '';
                  return (
                    <div
                      key={column.key}
                      className={`entry-grid-cell ${
                        customClassNames?.cell || ''
                      } ${customClassNames?.root}__${column.key}`}
                    >
                      {val ? numeral(val).format('0,0.00') : ''}
                    </div>
                  );
                }

                // For TEXT (with or without date placeholder), simply show the value.
                return (
                  <div
                    key={column.key}
                    className={`entry-grid-cell ${
                      customClassNames?.cell || ''
                    } ${customClassNames?.root}__${column.key}`}
                  >
                    {row[column.key] ? row[column.key]?.toString() : ''}
                  </div>
                );
              }
            })}
            {isEditable && showDeleteIconPerRow && (
              <div
                className={`entry-grid-cell ${
                  customClassNames?.cell || ''
                } entry-grid-cell__delete entry-grid-cell__delete-body ${
                  customClassNames?.deleteCell || ''
                } ${customClassNames?.deleteCellBody || ''}`}
              >
                <button
                  onClick={() => handleDeleteRow(rowIndex)}
                  className={`entry-grid-cell__delete-button ${
                    customClassNames?.deleteButton || ''
                  }`}
                >
                  <X />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={`entry-grid-footer ${customClassNames?.footer || ''}`}>
        {isEditable && (
          <button
            type="button"
            onClick={handleAddRow}
            className={`entry-grid-footer__button ${customClassNames?.addButton || ''}`}
          >
            Add New Line
          </button>
        )}
      </div>
    </div>
  );
};

export default EntryGrid;

interface PlaceholderInputCellProps {
  column: ColumnConfig;
  row: RowData;
  rowIndex: number;
  handleCellChange: (rowIndex: number, colKey: string, value: string) => void;
  inputRefs: React.MutableRefObject<{
    [key: string]: HTMLInputElement | null;
  }>;
  customClassNames?: CustomClassNames;
}

const PlaceholderInputCell: React.FC<PlaceholderInputCellProps> = React.memo(
  function PlaceholderInputCell({
    column,
    row,
    rowIndex,
    handleCellChange,
    inputRefs,
    customClassNames,
  }) {
    const cellKey = `${rowIndex}-${column.key}`;

    const placeholderHook = usePlaceholderInput({
      value: row[column.key]?.toString() || '',
      setValue: (newValue) => handleCellChange(rowIndex, column.key, newValue),
      inputRef: {
        current: inputRefs.current[cellKey] || null,
      },
    });

    return (
      <div
        className={`entry-grid-cell ${
          customClassNames?.cell || ''
        } entry-grid-cell__text ${customClassNames?.root}__${column.key}`}
      >
        <input
          ref={(el) => {
            if (el) {
              inputRefs.current[cellKey] = el;
            }
          }}
          type="text"
          value={row[column.key]?.toString() || ''}
          onChange={(e) => handleCellChange(rowIndex, column.key, e.target.value)}
          className={`entry-grid-cell__input ${
            customClassNames?.input || ''
          } entry-grid-cell__input-text ${customClassNames?.textInput || ''} ${
            customClassNames?.root
          }__input-${column.key}`}
        />
        <DatePlaceholderInput
          onInsert={placeholderHook.insertPlaceholderAtCursor}
          className="entry-grid-cell__placeholder"
        />
      </div>
    );
  },
);
