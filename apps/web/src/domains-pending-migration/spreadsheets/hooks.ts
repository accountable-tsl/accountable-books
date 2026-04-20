import React from 'react';
import * as Papa from 'papaparse';

import { parseCsvFile } from './utils';

import type { ParseCsvOptions, ParsedCsvResult } from './types';

interface CsvState {
  fileName: string;
  data: {
    parsed: Record<string, unknown>[];
    mapped: Record<string, unknown>[];
  };
  fieldMappings: {
    original: Record<string, string | undefined>;
    current: Record<string, string | undefined>;
  };
  error: string | null;
}

interface UseParseCsvProps extends Papa.ParseConfig {
  /**
   * Array of field mappings defining the structure of the imported data.
   * Each field includes a label, value, and optional required flag.
   * @example fields={[{ label: 'Name', value: 'name', required: true }, { label: 'Email', value: 'email' }]}
   */
  fields: { label: string; value: string; required?: boolean }[];

  /**
   * Callback function invoked when data is successfully parsed.
   * Receives an array of records representing the imported data.
   * @example onSuccess={(data) => console.log(data)}
   */
  onSuccess?: (data: Record<string, unknown>[]) => void;

  /**
   * Callback function invoked when an error occurs during parsing.
   * Receives an error message.
   * @example onError={(message) => console.error(message)}
   */
  onError?: (message: string) => void;

  /**
   * Flag to indicate if empty fields should be shown.
   * @default false
   * @example showEmptyFields={true}
   */
  showEmptyFields?: boolean;
}

export function useParseCsv(_p: UseParseCsvProps) {
  const [csvState, setCsvState] = React.useState<CsvState>({
    fileName: '',
    data: {
      parsed: [],
      mapped: [],
    },
    fieldMappings: {
      current: {},
      original: {},
    },
    error: null,
  });

  /**
   * Initializes all CSV import state for the UI, including field mappings, preview data, errors, and meta info.
   * Handles both files with and without headers, and sets up everything needed for mapping.
   *
   * @param {ParsedCsvResult} result - The parsed CSV file (from parseCsvFile).
   * @param {Array<{ label: string; value: string; required?: boolean }>} fields
   * @param {(state: ImportState) => void} setState - state for updating UI/import state.
   * @returns {void}
   */

  function initializeFieldMapping({
    result,
    fields,
    setState,
  }: {
    result: ParsedCsvResult;
    fields: { label: string; value: string; required?: boolean }[];
    setState: (state: any) => void;
  }): void {
    // Extract headers or generate default column names if missing
    let csvHeaders: string[];
    if (Array.isArray(result.headers) && result.headers.length > 0) {
      csvHeaders = result.headers;
    } else if (result.data[0]) {
      // No headers: generate "Column 1", "Column 2", ...
      const colCount = Object.keys(result.data[0]).length;
      csvHeaders = Array.from(
        { length: colCount },
        (_, i) => `Column ${i + 1}`,
      );
    } else {
      csvHeaders = [];
    }

    // Build initial field mapping: try to match app fields to CSV headers by name (case-insensitive)
    // If no match, fallback to original CSV header
    const fieldMappings: { [csvHeader: string]: string } = {};
    csvHeaders.forEach((csvHeader) => {
      const match = fields.find(
        (field) => field.value.toLowerCase() === csvHeader.toLowerCase(),
      );
      fieldMappings[csvHeader] = match ? match.value : csvHeader;
    });

    // 3. Identify required fields that are unmapped
    const unmappedRequiredFields = fields
      .filter((field) => field.required)
      .filter(
        (field) =>
          !csvHeaders.some(
            (csvHeader) =>
              field.value.toLowerCase() === csvHeader.toLowerCase(),
          ),
      )
      .map((field) => field.value);

    setState({
      fileName: result.file.name.replace(/\.[^/.]+$/, ''),
      headers: csvHeaders,

      fieldMappings: {
        original: fieldMappings,
        current: fieldMappings,
      },

      data: {
        parsed: result.data,
        mapped: result.data,
      },

      preview: result.preview,
      rowCount: result.rowCount,
      error: result.error,
      rowErrors: result.rowErrors,
      rawErrors: result.rawErrors,
      meta: result.meta,
      unmappedRequiredFields,
    });
  }

  // function oldOnParse({
  //   file,
  //   limit = Infinity,
  // }: {
  //   file: File;
  //   limit?: number;
  // }) {
  //   let count = 0;
  //   const allResults: Record<string, unknown>[] = [];

  //   Papa.parse<Record<string, unknown>>(file, {
  //     ...props,
  //     header: true,
  //     dynamicTyping: true,
  //     skipEmptyLines: true,
  //     beforeFirstChunk: (chunk) => {
  //       const parsedChunk = Papa.parse<string[]>(chunk, {
  //         header: false,
  //         skipEmptyLines: true,
  //       });

  //       const rows = parsedChunk.data;
  //       const columns = rows[0] ?? [];

  //       const newColumns = columns
  //         .map((column, index) => {
  //           if (column.trim() === '' && !showEmptyFields) {
  //             const hasNonEmptyValue = rows
  //               .slice(1)
  //               .some(
  //                 (row) =>
  //                   row[index] !== '' &&
  //                   row[index] !== null &&
  //                   row[index] !== undefined,
  //               );
  //             if (!hasNonEmptyValue) {
  //               return null;
  //             }
  //           }
  //           return column.trim() === '' ? `Field ${index + 1}` : column;
  //         })
  //         .filter((column) => column !== null);

  //       rows[0] = newColumns;
  //       return Papa.unparse(rows);
  //     },
  //     step: (results, parser) => {
  //       try {
  //         if (count === 0) {
  //           const mappings = (results.meta.fields ?? [])?.reduce(
  //             (acc, field) => ({
  //               ...acc,
  //               [field]: field,
  //             }),
  //             {},
  //           );

  //           setCsvState((prevState) => ({
  //             ...prevState,
  //             fieldMappings: {
  //               original: mappings,
  //               current: mappings,
  //             },
  //           }));
  //         }

  //         if (count < limit) {
  //           allResults.push(results.data);
  //           count++;
  //         } else {
  //           parser.abort();
  //           throw new Error(`Only ${limit} rows are allowed`);
  //         }
  //       } catch (err) {
  //         const message =
  //           err instanceof Error ? err.message : 'Something went wrong';
  //         setCsvState((prevState) => ({ ...prevState, error: message }));
  //         onError?.(message);
  //       }
  //     },
  //     complete: (_, localFile: File) => {
  //       setCsvState((prevState) => ({
  //         ...prevState,
  //         fileName: localFile?.name
  //           ? localFile.name.replace(/\.[^/.]+$/, '')
  //           : 'Untitled',
  //         data: {
  //           parsed: allResults,
  //           mapped: allResults,
  //         },
  //       }));
  //       onSuccess?.(allResults);
  //     },
  //   });
  // }

  async function onParse({
    file,
    ...parseOptions
  }: { file: File } & ParseCsvOptions) {
    const result = await parseCsvFile({
      file,
      ...parseOptions,
    });

    initializeFieldMapping({
      result,
      fields: _p.fields,
      setState: setCsvState,
    });
  }
  function onFieldChange({
    oldValue,
    newValue,
  }: {
    oldValue: string;
    newValue: string;
  }) {
    setCsvState((prevState) => ({
      ...prevState,
      fieldMappings: {
        ...prevState.fieldMappings,
        current: { ...prevState.fieldMappings.current, [newValue]: oldValue },
      },
      data: {
        ...prevState.data,
        mapped: prevState.data.mapped.map((row, index) => ({
          ...row,
          [newValue]: prevState.data.parsed[index]?.[oldValue],
        })),
      },
    }));
  }

  function onFieldToggle({
    value,
    checked,
  }: {
    value: string;
    checked: boolean;
  }) {
    setCsvState((prevState) => ({
      ...prevState,
      fieldMappings: {
        ...prevState.fieldMappings,
        current: {
          ...prevState.fieldMappings.current,
          [value]: checked ? '' : undefined,
        },
      },
      data: {
        ...prevState.data,
        mapped: prevState.data.mapped.map((row) => {
          const { [value]: _, ...rest } = row;
          return rest;
        }),
      },
    }));
  }

  function onFieldsReset() {
    setCsvState((prevState) => ({
      ...prevState,
      fieldMappings: {
        ...prevState.fieldMappings,
        current: prevState.fieldMappings.original,
      },
      data: {
        ...prevState.data,
        mapped: prevState.data.parsed,
      },
    }));
  }

  function getSanitizedData({ data }: { data: Record<string, unknown>[] }) {
    return data.map((row) =>
      Object.keys(row).reduce(
        (acc, key) => ({
          ...acc,
          [key]: row[key] === null ? '' : row[key],
        }),
        {},
      ),
    );
  }

  return {
    fileName: csvState.fileName,
    data: csvState.data.mapped,
    fieldMappings: csvState.fieldMappings,
    error: csvState.error,
    getSanitizedData,
    onParse,
    onFieldChange,
    onFieldToggle,
    onFieldsReset,
    initializeFieldMapping,
  };
}
