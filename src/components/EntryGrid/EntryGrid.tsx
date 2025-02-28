import { X } from "lucide-react";
import "./EntryGrid.scss";
import { useCallback, useState } from "react";
import numeral from "numeral";

export type EntryGridOption = {
  value: string;
  label: string;
};

export enum EntryGridColumnInputType {
  TEXT = "text",
  DROPDOWN = "dropdown",
  AMOUNT = "amount",
}

export type ColumnConfig =
  | {
      key: string;
      label: string;
      inputType: EntryGridColumnInputType.TEXT;
    }
  | {
      key: string;
      label: string;
      inputType: EntryGridColumnInputType.DROPDOWN;
      options: EntryGridOption[];
    }
  | { key: string; label: string; inputType: EntryGridColumnInputType.AMOUNT };

export type RowData = {
  [key: string]: string | EntryGridOption | null;
};

interface CustomClassNames {
  root?: string;
  headerContainer?: string;
  headerRow?: string;
  headerCell?: string;
  row?: string;
  cell?: string;
  dropdownCell?: string;
  textCell?: string;
  body?: string;
  bodyRow?: string;
  bodyCell?: string;
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
  initialRows: number;
  showDeleteIconPerRow: boolean;
  onChange: (rows: RowData[]) => void;
  customClassNames?: CustomClassNames;
}

const EntryGrid: React.FC<EntryGridProps> = ({
  columns,
  initialRows,
  showDeleteIconPerRow = false,
  onChange,
  customClassNames,
}) => {
  const createEmptyRow = useCallback((): RowData => {
    const row: RowData = {};
    columns.forEach((col) => {
      row[col.key] = col.inputType === "text" ? "" : null;
    });
    return row;
  }, [columns]);

  const [rows, setRows] = useState<RowData[]>(() => [
    ...Array.from({ length: initialRows }, createEmptyRow),
    createEmptyRow(),
  ]);

  // Check if a row is completely empty (i.e., all cells have default values)
  const isRowEmpty = useCallback(
    (row: RowData): boolean => {
      return columns.every((col) => {
        const value = row[col.key];
        return col.inputType === "text" ? value === "" : value === null;
      });
    },
    [columns]
  );

  // Handle change in a cell
  const handleCellChange = useCallback(
    (
      rowIndex: number,
      colKey: string,
      value: string | EntryGridOption | null
    ) => {
      setRows((prevRows) => {
        const newRows = [...prevRows];
        newRows[rowIndex] = { ...newRows[rowIndex], [colKey]: value };

        // If editing the last row (the extra row) and it becomes non-empty, append a new empty row.
        if (rowIndex === newRows.length - 1 && !isRowEmpty(newRows[rowIndex])) {
          newRows.push(createEmptyRow());
        }
        // Call onChange with all rows except the extra empty row.
        setTimeout(() => {
          onChange?.(
            newRows.filter((r, i) => i !== newRows.length - 1 || !isRowEmpty(r))
          );
        }, 0);

        return newRows;
      });
    },
    [isRowEmpty, onChange]
  );

  const handleAmountChange = (
    rowIndex: number,
    colKey: string,
    value: string
  ) => {
    const sanitizedValue = value.replace(/[^0-9.]/g, "");
    handleCellChange(rowIndex, colKey, sanitizedValue);
  };

  const onAmountBlur = (rowIndex: number, colKey: string, value: string) => {
    const sanitized = value.replace(/[^0-9.]/g, "");
    const formatted = sanitized ? numeral(sanitized).format("0,0.00") : "";
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
    [isRowEmpty, onChange]
  );
  return (
    <div className={`entry-grid ${customClassNames?.root || ""}`}>
      <div
        className={`entry-grid-header ${
          customClassNames?.headerContainer || ""
        }`}
      >
        <div
          className={`entry-grid-row ${
            customClassNames?.row || ""
          } entry-grid-row__header ${customClassNames?.headerRow || ""}`}
          role="row"
        >
          {columns.map((column) => (
            <div
              key={column.key}
              className={`entry-grid-cell ${customClassNames?.cell || ""} ${
                customClassNames?.headerCell || ""
              } entry-grid-cell__header`}
            >
              {column.label}
            </div>
          ))}
          {showDeleteIconPerRow && (
            <div
              className={`entry-grid-cell ${
                customClassNames?.cell || ""
              } entry-grid-cell__delete ${
                customClassNames?.deleteCell || ""
              } entry-grid-cell__delete-header ${
                customClassNames?.deleteCellHeader || ""
              }`}
            ></div>
          )}
        </div>
      </div>

      <div className={`entry-grid-body ${customClassNames?.body || ""}`}>
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className={`entry-grid-row entry-grid-body__row ${
              customClassNames?.row || ""
            }`}
          >
            {columns.map((column) => {
              if (column.inputType === "dropdown") {
                return (
                  <div
                    key={column.key}
                    className={`entry-grid-cell ${
                      customClassNames?.cell || ""
                    } entry-grid-cell__dropdown ${
                      customClassNames?.dropdownCell || ""
                    }`}
                  >
                    <select
                      className={`entry-grid-cell__input ${
                        customClassNames?.input || ""
                      } entry-grid-cell__input-dropdown ${
                        customClassNames?.dropdownSelect || ""
                      }`}
                      value={
                        (row[column.key] as { value: string })?.value || ""
                      }
                      onChange={(e) => {
                        const option = column.options.find(
                          (opt) => opt.value === e.target.value
                        );
                        option &&
                          handleCellChange(rowIndex, column.key, option);
                      }}
                    >
                      <option
                        value=""
                        disabled
                        defaultValue={""}
                        hidden
                        className={`entry-grid-cell__dropdown-option ${
                          customClassNames?.dropdownOption || ""
                        }`}
                      ></option>
                      {column.options.map((option, index) => (
                        <option
                          key={index}
                          value={option.value}
                          className={`entry-grid-cell__dropdown-option ${
                            customClassNames?.dropdownOption || ""
                          }`}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              if (column.inputType === "amount") {
                return (
                  <div
                    key={column.key}
                    className={`entry-grid-cell ${
                      customClassNames?.cell || ""
                    } entry-grid-cell__text ${
                      customClassNames?.textCell || ""
                    }`}
                  >
                    <input
                      className={`entry-grid-cell__input ${
                        customClassNames?.input || ""
                      } entry-grid-cell__input-text ${
                        customClassNames?.textInput || ""
                      }`}
                      type="text"
                      inputMode="decimal"
                      value={row[column.key]?.toString() || ""}
                      onChange={(e) =>
                        handleAmountChange(rowIndex, column.key, e.target.value)
                      }
                      onBlur={(e) =>
                        onAmountBlur(rowIndex, column.key, e.target.value)
                      }
                    />
                  </div>
                );
              }

              return (
                <div
                  key={column.key}
                  className={`entry-grid-cell ${
                    customClassNames?.cell || ""
                  } entry-grid-cell__text ${customClassNames?.textCell || ""}`}
                >
                  <input
                    className={`entry-grid-cell__input ${
                      customClassNames?.input || ""
                    } entry-grid-cell__input-text ${
                      customClassNames?.textInput || ""
                    }`}
                    type="text"
                    value={row[column.key]?.toString() || ""}
                    onChange={(e) =>
                      handleCellChange(rowIndex, column.key, e.target.value)
                    }
                  />
                </div>
              );
            })}
            {showDeleteIconPerRow && (
              <div
                className={`entry-grid-cell ${
                  customClassNames?.cell || ""
                } entry-grid-cell__delete entry-grid-cell__delete-body ${
                  customClassNames?.deleteCell || ""
                } ${customClassNames?.deleteCellBody || ""}`}
              >
                <button
                  onClick={() => handleDeleteRow(rowIndex)}
                  className={`entry-grid-cell__delete-button ${
                    customClassNames?.deleteButton || ""
                  }`}
                >
                  <X />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={`entry-grid-footer ${customClassNames?.footer || ""}`}>
        <button
          type="button"
          onClick={handleAddRow}
          className={`entry-grid-footer__button ${
            customClassNames?.addButton || ""
          }`}
        >
          Add New Line
        </button>
      </div>
    </div>
  );
};

export default EntryGrid;
