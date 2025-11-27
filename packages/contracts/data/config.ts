/**
 * Data pipeline configuration.
 *
 * This file is optional - the build script will auto-discover all files in data/source/
 * and use sensible defaults. Use this file to override defaults or add schemas for validation.
 *
 * Default behavior:
 * - TS-source files: Generate JSON + TS re-export (enabled by default)
 * - JSON-source files: Generate JSON only (TS disabled unless schema provided)
 * - CSV-source files: Parse to JSON, generate TS only if schema provided
 * - Domain: Inferred from folder structure (data/source/account/ → account)
 * - Export names: Inferred from filename or first export in TS file
 * - Type names: Inferred from export names (PascalCase)
 */

export interface DataFileConfig {
  // Source info
  source: string; // Relative to data/source/

  // Schema (optional - for JSON/CSV sources)
  schema?: {
    path: string; // Relative to schema/ts/
    exportName: string; // Which export from schema file
  };

  // TypeScript generation (optional)
  typescript?: {
    enabled?: boolean; // Default: true for TS-source, false for JSON/CSV
    exportName?: string; // Default: inferred from filename
    typeName?: string; // Default: inferred from exportName
    validate?: boolean; // Default: true if schema exists, false otherwise
  };

  // Exports (for TS-source files)
  exports?: string[]; // Which exports to process, default all in the file
}

/**
 * Data file configurations.
 *
 * Minimal config example:
 * {
 *   source: 'account/account-types.ts',
 *   // Everything else auto-detected
 * }
 *
 * Full config example (for JSON with schema):
 * {
 *   source: 'banking/banks.json',
 *   schema: {
 *     path: 'banking/bank',
 *     exportName: 'banksSchema',
 *   },
 *   typescript: {
 *     enabled: true,
 *     exportName: 'banks',
 *     typeName: 'Bank',
 *     validate: true,
 *   },
 * }
 */
export const dataConfig: DataFileConfig[] = [
  // Example: TS-source file with multiple exports
  // {
  //   source: 'account/account-element-id.ts',
  //   exports: ['accountElementIds', 'financialStatementIds'],
  //   typescript: {
  //     exportName: 'accountElementIds', // Primary export
  //   },
  // },
];
