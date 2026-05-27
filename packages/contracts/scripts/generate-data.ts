#!/usr/bin/env node
/**
 * Data generation pipeline for contracts package.
 *
 * This script:
 * 1. Auto-discovers all files in data/source/ recursively
 * 2. Auto-detects format (ts, json, csv) and domain from folder structure
 * 3. Loads optional config from data/config.ts and merges with discovered files
 * 4. Generates canonical JSON in data/generated/json/
 * 5. Generates TypeScript re-exports in data/generated/ts/ when appropriate
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, extname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { ZodSchema } from 'zod';
import Papa from 'papaparse';
import { format } from 'prettier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, '..');

// Paths
const DATA_ROOT = join(PACKAGE_ROOT, 'accountable_contracts', 'data');
const SOURCE_DIR = join(DATA_ROOT, 'source');
const GENERATED_DIR = join(DATA_ROOT, 'generated');
const JSON_OUTPUT_DIR = join(GENERATED_DIR, 'json');
const TS_OUTPUT_DIR = join(GENERATED_DIR, 'ts');
const CONFIG_PATH = join(DATA_ROOT, 'config.ts');
const SCHEMA_TS_DIR = join(
  PACKAGE_ROOT,
  'accountable_contracts',
  'schema',
  'source',
);

// Large file threshold (1MB)
const LARGE_FILE_THRESHOLD = 1_000_000;

interface MinimalConfig {
  source: string; // Relative to data/source/
  schema?: {
    path: string; // Relative to schema/source/
    exportName: string;
  };
  typescript?: {
    enabled?: boolean;
    exportName?: string;
    typeName?: string;
    validate?: boolean;
  };
  exports?: string[]; // For TS files
}

interface ResolvedConfig {
  source: string;
  format: 'ts' | 'json' | 'csv';
  domain: string;
  schema?: { path: string; exportName: string };
  typescript: {
    enabled: boolean;
    exportName: string;
    typeName: string;
    validate: boolean;
    schema?: ZodSchema;
  };
  exports?: string[];
}

interface GeneratedFile {
  domain: string;
  basename: string;
  hasTSExport: boolean;
  tsExportName?: string;
}

/**
 * Discover all source files recursively
 */
function discoverSourceFiles(): string[] {
  const files: string[] = [];

  function scanDir(dir: string, basePath: string = '') {
    if (!existsSync(dir)) {
      return;
    }

    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        scanDir(fullPath, relPath);
      } else if (['.ts', '.json', '.csv'].includes(extname(entry.name))) {
        files.push(relPath);
      }
    }
  }

  scanDir(SOURCE_DIR);
  return files;
}

/**
 * Detect file format from extension
 */
function detectFormat(filePath: string): 'ts' | 'json' | 'csv' {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
      return 'ts';
    case '.json':
      return 'json';
    case '.csv':
      return 'csv';
    default:
      throw new Error(`Unknown file format: ${ext}`);
  }
}

/**
 * Detect domain from folder structure (data/source/account/file.ts → account)
 */
function detectDomain(sourcePath: string): string {
  const parts = sourcePath.split('/');
  if (parts.length < 2) {
    throw new Error(`Invalid source path structure: ${sourcePath}`);
  }
  return parts[0]; // First folder after source/
}

/**
 * Convert kebab-case or snake_case to camelCase
 */
function camelCase(str: string): string {
  return str
    .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

/**
 * Convert to PascalCase
 */
function pascalCase(str: string): string {
  const camel = camelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Convert kebab-case or mixed case to Python snake_case
 */
function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1') // Insert underscore before capitals
    .replace(/[-_]+/g, '_') // Replace hyphens and multiple underscores with single underscore
    .toLowerCase()
    .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
}

/**
 * Infer export name from TS file content
 */
async function inferTSExportName(tsPath: string): Promise<string> {
  const fullPath = join(SOURCE_DIR, tsPath);
  if (!existsSync(fullPath)) {
    return `default${pascalCase(basename(tsPath, '.ts'))}`;
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');
    // Look for: export const defaultAccountTypes = ...
    const exportMatch = content.match(/export\s+const\s+(\w+)\s*=/);
    if (exportMatch) {
      return exportMatch[1];
    }
  } catch (error) {
    // Fallback to filename-based name
  }

  return `default${pascalCase(basename(tsPath, '.ts'))}`;
}

/**
 * Discover all export const declarations from a TS file
 */
async function discoverTSExports(tsPath: string): Promise<string[]> {
  const fullPath = join(SOURCE_DIR, tsPath);
  if (!existsSync(fullPath)) {
    return [];
  }

  try {
    // Dynamically import the module to get all exports
    const module = await import(fullPath.replace(/\.ts$/, '.js'));

    // Filter to only export const declarations (not types, functions, default exports)
    const exports: string[] = [];
    for (const [exportName, exportValue] of Object.entries(module)) {
      // Skip default exports, types, and functions
      if (exportName === 'default') continue;
      if (typeof exportValue === 'function') continue;
      // Include all const exports (arrays, objects, primitives)
      exports.push(exportName);
    }

    return exports;
  } catch (error) {
    console.warn(`⚠ Could not discover exports from ${tsPath}: ${error}`);
    return [];
  }
}

/**
 * Load explicit config from data/config.ts
 */
async function loadConfig(): Promise<Map<string, MinimalConfig>> {
  const configMap = new Map<string, MinimalConfig>();

  if (!existsSync(CONFIG_PATH)) {
    return configMap;
  }

  try {
    // Dynamic import of config file
    const configModule = await import(CONFIG_PATH.replace(/\.ts$/, '.js'));
    const configs: MinimalConfig[] = configModule.dataConfig || [];

    for (const config of configs) {
      configMap.set(config.source, config);
    }
  } catch (error) {
    console.warn(`⚠ Could not load config from ${CONFIG_PATH}: ${error}`);
  }

  return configMap;
}

/**
 * Load Zod schema from schema/source/
 */
async function loadSchema(
  schemaPath: string,
  exportName: string,
): Promise<ZodSchema | null> {
  try {
    const fullPath = join(SCHEMA_TS_DIR, `${schemaPath}.ts`);
    if (!existsSync(fullPath)) {
      return null;
    }

    const schemaModule = await import(
      `../accountable_contracts/schema/source/${schemaPath}.js`
    );
    const schema = schemaModule[exportName];

    if (!schema) {
      console.warn(
        `⚠ Schema export "${exportName}" not found in ${schemaPath}`,
      );
      return null;
    }

    return schema as ZodSchema;
  } catch (error) {
    console.warn(`⚠ Could not load schema from ${schemaPath}: ${error}`);
    return null;
  }
}

/**
 * Resolve config with defaults and auto-detection
 * For TS files, returns multiple configs (one per export)
 */
async function resolveConfigs(
  minimalConfig: MinimalConfig | undefined,
  sourcePath: string,
): Promise<ResolvedConfig[]> {
  const format = detectFormat(sourcePath);
  const domain = detectDomain(sourcePath);
  const fileBasename = basename(sourcePath, extname(sourcePath));

  // For TS files, discover all exports and create a config for each
  if (format === 'ts') {
    // If explicit exports are specified in config, use those
    if (minimalConfig?.exports && minimalConfig.exports.length > 0) {
      return minimalConfig.exports.map((exportName) => {
        const typeName =
          minimalConfig?.typescript?.typeName || pascalCase(exportName);
        const hasSchema = minimalConfig?.schema !== undefined;
        const defaultEnabled = true; // TS files always enabled
        const enabled = minimalConfig?.typescript?.enabled ?? defaultEnabled;
        const validate = minimalConfig?.typescript?.validate ?? hasSchema;

        return {
          source: sourcePath,
          format,
          domain,
          schema: minimalConfig?.schema,
          typescript: {
            enabled,
            exportName,
            typeName,
            validate,
          },
          exports: [exportName],
        };
      });
    }

    // Auto-discover all exports
    const discoveredExports = await discoverTSExports(sourcePath);

    if (discoveredExports.length === 0) {
      // Fallback to filename-based export if no exports found
      const fallbackExport = camelCase(fileBasename);
      const typeName =
        minimalConfig?.typescript?.typeName || pascalCase(fallbackExport);
      const hasSchema = minimalConfig?.schema !== undefined;
      const enabled = minimalConfig?.typescript?.enabled ?? true;
      const validate = minimalConfig?.typescript?.validate ?? hasSchema;

      return [
        {
          source: sourcePath,
          format,
          domain,
          schema: minimalConfig?.schema,
          typescript: {
            enabled,
            exportName: fallbackExport,
            typeName,
            validate,
          },
        },
      ];
    }

    // Create a config for each discovered export
    return discoveredExports.map((exportName) => {
      const typeName =
        minimalConfig?.typescript?.typeName || pascalCase(exportName);
      const hasSchema = minimalConfig?.schema !== undefined;
      const enabled = minimalConfig?.typescript?.enabled ?? true;
      const validate = minimalConfig?.typescript?.validate ?? hasSchema;

      return {
        source: sourcePath,
        format,
        domain,
        schema: minimalConfig?.schema,
        typescript: {
          enabled,
          exportName,
          typeName,
          validate,
        },
        exports: [exportName],
      };
    });
  }

  // For non-TS files, return single config (existing behavior)
  let exportName: string;
  if (minimalConfig?.typescript?.exportName) {
    exportName = minimalConfig.typescript.exportName;
  } else {
    exportName = camelCase(fileBasename);
  }

  const typeName =
    minimalConfig?.typescript?.typeName || pascalCase(exportName);
  const hasSchema = minimalConfig?.schema !== undefined;
  const defaultEnabled = format === 'ts' || hasSchema;
  const enabled = minimalConfig?.typescript?.enabled ?? defaultEnabled;
  const validate = minimalConfig?.typescript?.validate ?? hasSchema;

  return [
    {
      source: sourcePath,
      format,
      domain,
      schema: minimalConfig?.schema,
      typescript: {
        enabled,
        exportName,
        typeName,
        validate,
      },
      exports: minimalConfig?.exports,
    },
  ];
}

/**
 * Process TS file: import and serialize exports
 */
async function processTSFile(
  config: ResolvedConfig,
): Promise<{ data: any; exportName: string }> {
  const sourcePath = join(SOURCE_DIR, config.source);
  const module = await import(sourcePath.replace(/\.ts$/, '.js'));

  // Determine which export to use
  const exports = config.exports || [config.typescript.exportName];
  const primaryExport = exports[0];

  if (!module[primaryExport]) {
    throw new Error(`Export "${primaryExport}" not found in ${config.source}`);
  }

  return {
    data: module[primaryExport],
    exportName: primaryExport,
  };
}

/**
 * Process JSON file: read and parse
 */
function processJSONFile(config: ResolvedConfig): any {
  const sourcePath = join(SOURCE_DIR, config.source);
  const content = readFileSync(sourcePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Process CSV file: parse to JSON
 */
function processCSVFile(config: ResolvedConfig): any[] {
  const sourcePath = join(SOURCE_DIR, config.source);
  const content = readFileSync(sourcePath, 'utf-8');

  try {
    const result = Papa.parse<Record<string, unknown>>(content, {
      header: true, // Use first row as headers
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
    });

    if (result.errors.length > 0) {
      const errorMessages = result.errors
        .map((err) => `Row ${err.row}: ${err.message}`)
        .join('; ');
      throw new Error(`CSV parse errors: ${errorMessages}`);
    }

    return result.data;
  } catch (error) {
    throw new Error(`Failed to parse CSV ${config.source}: ${error}`);
  }
}

/**
 * Generate JSON output
 * JSON filenames are always in snake_case for consistency
 */
async function generateJSON(
  config: ResolvedConfig,
  data: any,
  exportName?: string,
): Promise<void> {
  const outputDir = join(JSON_OUTPUT_DIR, config.domain);

  // All JSON files use snake_case for consistency
  let outputFilename: string;
  if (config.format === 'ts' && exportName) {
    outputFilename = `${toSnakeCase(exportName)}.json`;
  } else {
    // Convert original filename to snake_case
    const originalBasename = basename(config.source, extname(config.source));
    outputFilename = `${toSnakeCase(originalBasename)}.json`;
  }

  const outputFile = join(outputDir, outputFilename);

  // Ensure directory exists
  mkdirSync(outputDir, { recursive: true });

  // Check file size for large files
  const sourcePath = join(SOURCE_DIR, config.source);
  const fileSize = existsSync(sourcePath) ? statSync(sourcePath).size : 0;

  if (config.format === 'json' && fileSize > LARGE_FILE_THRESHOLD) {
    // For large JSON files, copy directly without pretty-printing
    copyFileSync(sourcePath, outputFile);
    console.log(`⏩ Large file copied directly (${fileSize} bytes)`);
  } else {
    // Keep generated JSON stable with Prettier/lint-staged output.
    const content = await format(JSON.stringify(data), {
      parser: 'json',
      trailingComma: 'none',
      printWidth: 80,
    });
    writeFileSync(outputFile, content, 'utf-8');
  }

  console.log(`✓ Generated ${relative(PACKAGE_ROOT, outputFile)}`);
}

/**
 * Generate TypeScript re-export
 * For TS sources: imports directly from TS source (no JSON dependency)
 * For JSON/CSV sources: imports from generated JSON
 * Uses modern ESM with { type: 'json' } syntax
 */
async function generateTSReExport(
  config: ResolvedConfig,
  data: any,
  exportName?: string,
): Promise<void> {
  const outputDir = join(TS_OUTPUT_DIR, config.domain);

  // For TS files with specific export, use export name as filename
  // For other files, use original filename
  let outputFilename: string;
  if (config.format === 'ts' && exportName) {
    outputFilename = `${exportName}.ts`;
  } else {
    outputFilename = `${basename(config.source, extname(config.source))}.ts`;
  }

  const outputFile = join(outputDir, outputFilename);

  // Ensure directory exists
  mkdirSync(outputDir, { recursive: true });

  let tsContent: string;

  if (config.format === 'ts') {
    // For TS sources: import directly from source file
    const sourceRelativePath = `../../../source/${config.source.replace(/\.ts$/, '.js')}`;

    if (config.typescript.validate && config.schema) {
      // Generate with schema validation
      const schemaPath = config.schema.path;
      const schemaExport = config.schema.exportName;

      tsContent = `import { ${schemaExport} } from '../../schema/source/${schemaPath}.js';
import { ${exportName || config.typescript.exportName} as rawData } from '${sourceRelativePath}';

export const ${config.typescript.exportName} = ${schemaExport}.parse(rawData);
export type ${config.typescript.typeName} = typeof ${config.typescript.exportName}[number];
`;
    } else {
      // Generate without validation - direct re-export
      tsContent = `export { ${exportName || config.typescript.exportName} as ${config.typescript.exportName} } from '${sourceRelativePath}';
`;
    }
  } else {
    // For JSON/CSV sources: import from generated JSON (snake_case filename)
    const jsonBasename = toSnakeCase(
      basename(config.source, extname(config.source)),
    );
    const jsonRelativePath = `../../json/${config.domain}/${jsonBasename}.json`;

    if (config.typescript.validate && config.schema) {
      // Generate with schema validation
      const schemaPath = config.schema.path;
      const schemaExport = config.schema.exportName;

      tsContent = `import { ${schemaExport} } from '../../schema/source/${schemaPath}.js';
import data from '${jsonRelativePath}' with { type: 'json' };

export const ${config.typescript.exportName} = ${schemaExport}.parse(data);
export type ${config.typescript.typeName} = typeof ${config.typescript.exportName}[number];
`;
    } else {
      // Generate without validation
      tsContent = `import data from '${jsonRelativePath}' with { type: 'json' };

export const ${config.typescript.exportName} = data;
// Note: No type safety - add schema to config.ts to enable validation
`;
    }
  }

  writeFileSync(outputFile, tsContent, 'utf-8');
  console.log(`✓ Generated ${relative(PACKAGE_ROOT, outputFile)}`);
}

/**
 * Main processing function
 */
async function processFile(config: ResolvedConfig): Promise<void> {
  try {
    // Step 1: Process source file to get data
    let data: any;
    let exportName: string | undefined;

    switch (config.format) {
      case 'ts': {
        const tsResult = await processTSFile(config);
        data = tsResult.data;
        exportName = tsResult.exportName;
        break;
      }
      case 'json':
        data = processJSONFile(config);
        exportName = config.typescript.exportName;
        break;
      case 'csv':
        data = processCSVFile(config);
        exportName = config.typescript.exportName;
        break;
    }

    // Step 2: Generate JSON (always)
    await generateJSON(config, data, exportName);

    // Step 3: Generate TS if enabled
    if (config.typescript.enabled) {
      // Load schema if needed
      if (config.schema) {
        const schema = await loadSchema(
          config.schema.path,
          config.schema.exportName,
        );
        if (schema) {
          config.typescript.schema = schema;
        } else if (config.typescript.validate) {
          console.warn(
            `⚠ Schema not found for ${config.source}, generating TS without validation`,
          );
          config.typescript.validate = false;
        }
      }

      await generateTSReExport(config, data, exportName);
    }
  } catch (error) {
    console.error(`✗ Error processing ${config.source}: ${error}`);
    throw error;
  }
}

/**
 * Clean generated directories
 */
function cleanGenerated(): void {
  if (existsSync(GENERATED_DIR)) {
    rmSync(GENERATED_DIR, { recursive: true, force: true });
  }
}

/**
 * Ensure Python __init__.py files exist for package structure
 * Note: These are minimal placeholders. generatePythonDataHelpers() will overwrite
 * data/generated/json/__init__.py and data/__init__.py with full implementations.
 */
function ensurePythonInitFiles(domains: string[]): void {
  const initFiles = [
    {
      path: join(GENERATED_DIR, '__init__.py'),
      content: '"""Generated data files."""\n',
    },
  ];

  // Add domain-specific __init__.py files (these won't be overwritten)
  for (const domain of domains) {
    initFiles.push({
      path: join(JSON_OUTPUT_DIR, domain, '__init__.py'),
      content: `"""${domain.charAt(0).toUpperCase() + domain.slice(1)}-related data files."""\n`,
    });
  }

  // Create all __init__.py files (only if they don't exist)
  for (const { path, content } of initFiles) {
    // Ensure parent directory exists
    const parentDir = dirname(path);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    // Create __init__.py if it doesn't exist or was deleted
    if (!existsSync(path)) {
      writeFileSync(path, content, 'utf-8');
      console.log(`✓ Created ${relative(PACKAGE_ROOT, path)}`);
    }
  }
}

/**
 * Discover all JSON files recursively in data/generated/json/
 */
function discoverJSONFiles(): Array<{
  domain: string;
  filename: string;
  path: string;
}> {
  const jsonFiles: Array<{ domain: string; filename: string; path: string }> =
    [];

  function scanDir(dir: string, domain: string = '') {
    if (!existsSync(dir)) {
      return;
    }

    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Domain directory
        scanDir(fullPath, entry.name);
      } else if (entry.name.endsWith('.json')) {
        // JSON file
        const currentDomain = domain || 'root';
        jsonFiles.push({
          domain: currentDomain,
          filename: entry.name,
          path: fullPath,
        });
      }
    }
  }

  scanDir(JSON_OUTPUT_DIR);
  return jsonFiles;
}

/**
 * Generate Python helper functions for loading JSON data files
 */
function generatePythonDataHelpers(): void {
  const jsonFiles = discoverJSONFiles();

  if (jsonFiles.length === 0) {
    console.log('⚠ No JSON files found to generate helpers for');
    return;
  }

  // Build helper functions for each JSON file
  const helpers: Array<{
    name: string;
    getterName: string;
    domain: string;
    filename: string;
  }> = [];

  for (const { domain, filename } of jsonFiles) {
    const fileBasename = basename(filename, '.json');
    const pythonName = toSnakeCase(fileBasename);
    const getterName = `get_${pythonName}`;

    helpers.push({
      name: pythonName,
      getterName,
      domain,
      filename,
    });
  }

  // Sort by name for consistent output
  helpers.sort((a, b) => a.name.localeCompare(b.name));

  // Generate data/generated/json/__init__.py
  const jsonInitPath = join(JSON_OUTPUT_DIR, '__init__.py');
  const jsonFunctions: string[] = [];
  const jsonCacheVars: string[] = [];
  const jsonCacheFuncs: string[] = [];

  for (const helper of helpers) {
    const domainPath = helper.domain === 'root' ? '' : `${helper.domain}/`;
    const cacheVarName = `_${helper.name}_cache`;

    // Generate getter function
    jsonFunctions.push(`
def ${helper.getterName}() -> list[dict[str, Any]] | dict[str, Any]:
    """Load ${helper.filename} data."""
    from importlib.resources import files
    import json
    json_file = files("accountable_contracts.data.generated.json") / "${domainPath}${helper.filename}"
    return json.loads(json_file.read_text(encoding="utf-8"))`);

    // Generate cache variable
    jsonCacheVars.push(
      `${cacheVarName}: list[dict[str, Any]] | dict[str, Any] | None = None`,
    );

    // Generate cached accessor function
    jsonCacheFuncs.push(`
def ${helper.name}() -> list[dict[str, Any]] | dict[str, Any]:
    """Get ${helper.filename} data (cached)."""
    global ${cacheVarName}
    if ${cacheVarName} is None:
        ${cacheVarName} = ${helper.getterName}()
    return ${cacheVarName}`);
  }

  const jsonInitContent = `"""JSON data files with helper functions."""

from importlib.resources import files
import json
from typing import Any

# Cache variables
${jsonCacheVars.join('\n')}

# Getter functions (always return fresh data)
${jsonFunctions.join('\n')}

# Cached accessor functions (load once, reuse)
${jsonCacheFuncs.join('\n')}

__all__ = [
${helpers.map((h) => `    "${h.getterName}",\n    "${h.name}",`).join('\n')}
]
`;

  writeFileSync(jsonInitPath, jsonInitContent, 'utf-8');
  console.log(
    `✓ Generated ${relative(PACKAGE_ROOT, jsonInitPath)} with ${helpers.length} data helpers`,
  );

  // Generate data/__init__.py
  const dataInitPath = join(DATA_ROOT, '__init__.py');
  const imports: string[] = [];
  const exports: string[] = [];

  for (const helper of helpers) {
    imports.push(`    ${helper.getterName},`);
    imports.push(`    ${helper.name},`);
    exports.push(`    "${helper.getterName}",`);
    exports.push(`    "${helper.name}",`);
  }

  const dataInitContent = `"""Data files shared between TypeScript and Python."""

from .generated.json import (
${imports.join('\n')}
)

__all__ = [
${exports.join('\n')}
]
`;

  writeFileSync(dataInitPath, dataInitContent, 'utf-8');
  console.log(
    `✓ Generated ${relative(PACKAGE_ROOT, dataInitPath)} with ${helpers.length} data exports`,
  );
}

/**
 * Generate main data index file
 */
async function generateDataIndex(
  generatedFiles: GeneratedFile[],
): Promise<void> {
  const indexPath = join(DATA_ROOT, 'index.ts');

  const tsExports: string[] = [];
  const jsonExports: string[] = [];

  // Group by domain for better organization
  const byDomain = new Map<string, GeneratedFile[]>();
  const sortedFiles = [...generatedFiles].sort((a, b) => {
    if (a.domain !== b.domain) {
      return a.domain.localeCompare(b.domain);
    }
    return a.basename.localeCompare(b.basename);
  });

  for (const file of sortedFiles) {
    if (!byDomain.has(file.domain)) {
      byDomain.set(file.domain, []);
    }
    byDomain.get(file.domain)!.push(file);
  }

  // Generate exports
  const sortedDomains = Array.from(byDomain.keys()).sort((a, b) =>
    a.localeCompare(b),
  );

  for (const domain of sortedDomains) {
    const files = byDomain.get(domain)!;
    for (const file of files) {
      if (file.hasTSExport && file.tsExportName) {
        // TypeScript export (typed)
        tsExports.push(
          `export * from './generated/ts/${domain}/${file.basename}.js';`,
        );

        // JSON export (direct access) - use snake_case for filename
        const jsonFilename = toSnakeCase(file.basename);
        jsonExports.push(
          `export { default as ${file.tsExportName}Json } from './generated/json/${domain}/${jsonFilename}.json' with { type: 'json' };`,
        );
      } else {
        // Only JSON export (no TS file generated)
        const jsonExportName = camelCase(file.basename);
        const jsonFilename = toSnakeCase(file.basename);
        jsonExports.push(
          `export { default as ${jsonExportName}Json } from './generated/json/${domain}/${jsonFilename}.json' with { type: 'json' };`,
        );
      }
    }
  }

  const unformattedContent = `/**
 * Generated data index - exports all data files.
 *
 * This file is auto-generated by scripts/generate-data.ts
 * Do not edit manually.
 */

// TypeScript exports (typed, validated if schema exists)
${tsExports.join('\n')}
${jsonExports.length > 0 ? '\n// JSON exports\n' + jsonExports.join('\n') : ''}
`;

  const content = await format(unformattedContent, {
    parser: 'typescript',
    semi: true,
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 80,
  });

  writeFileSync(indexPath, content, 'utf-8');
  console.log(`✓ Generated ${relative(PACKAGE_ROOT, indexPath)}`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const shouldClean = !args.includes('--no-clean');

  if (shouldClean) {
    console.log('Cleaning generated directories...');
    cleanGenerated();
  }

  console.log('Discovering source files...');
  const discoveredFiles = discoverSourceFiles();

  if (discoveredFiles.length === 0) {
    console.log('No source files found in data/source/');
    return;
  }

  console.log(`Found ${discoveredFiles.length} source file(s)`);

  console.log('Loading config...');
  const explicitConfig = await loadConfig();

  console.log('Resolving configs...');
  const resolvedConfigs: ResolvedConfig[] = [];

  for (const sourcePath of discoveredFiles) {
    const explicit = explicitConfig.get(sourcePath);
    const configs = await resolveConfigs(explicit, sourcePath);
    resolvedConfigs.push(...configs);

    if (!explicit) {
      const exportCount = configs.length;
      if (exportCount > 1) {
        console.log(
          `ℹ Auto-discovered: ${sourcePath} (${exportCount} exports)`,
        );
      } else {
        console.log(`ℹ Auto-discovered: ${sourcePath} (using defaults)`);
      }
    }
  }

  console.log('Processing files...');
  const generatedFiles: GeneratedFile[] = [];
  const domains = new Set<string>();

  for (const config of resolvedConfigs) {
    await processFile(config);
    domains.add(config.domain);

    // Track generated files for index
    // For TS files, use export name as basename; for others, use original filename
    let fileBasename: string;
    if (config.format === 'ts' && config.typescript.exportName) {
      fileBasename = config.typescript.exportName;
    } else {
      fileBasename = basename(config.source, extname(config.source));
    }

    if (config.typescript.enabled) {
      generatedFiles.push({
        domain: config.domain,
        basename: fileBasename,
        hasTSExport: true,
        tsExportName: config.typescript.exportName,
      });
    } else {
      // File has JSON but no TS export
      generatedFiles.push({
        domain: config.domain,
        basename: fileBasename,
        hasTSExport: false,
      });
    }
  }

  console.log('Ensuring Python __init__.py files...');
  ensurePythonInitFiles(Array.from(domains));

  console.log('Generating Python data helpers...');
  generatePythonDataHelpers();

  console.log('Generating index file...');
  await generateDataIndex(generatedFiles);

  console.log('✓ Data generation complete');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
