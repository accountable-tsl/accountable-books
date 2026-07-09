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
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ParseError } from 'papaparse';
import type { ZodType } from 'zod';
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
const EXPORT_CONST_PATTERN = /export\s+const\s+(\w+)\s*=/;

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
    schema?: ZodType;
  };
  exports?: string[];
}

interface GeneratedFile {
  domain: string;
  basename: string;
  hasTSExport: boolean;
  tsExportName?: string;
}

interface JsonOutputRef {
  domain: string;
  filename: string;
}

interface SyncStats {
  written: number;
  unchanged: number;
  deleted: number;
  outOfDate: number;
}

interface SyncContext {
  verify: boolean;
  clean: boolean;
  plannedPaths: Set<string>;
  stats: SyncStats;
}

function createSyncContext(verify: boolean, clean: boolean): SyncContext {
  return {
    verify,
    clean,
    plannedPaths: new Set<string>(),
    stats: { written: 0, unchanged: 0, deleted: 0, outOfDate: 0 },
  };
}

function normalizeContent(content: string): string {
  let normalized = content.replaceAll('\r\n', '\n');
  while (normalized.endsWith('\n')) {
    normalized = normalized.slice(0, -1);
  }
  return `${normalized}\n`;
}

function syncFile(ctx: SyncContext, filePath: string, content: string): void {
  const resolvedPath = resolve(filePath);
  ctx.plannedPaths.add(resolvedPath);
  const normalized = normalizeContent(content);

  if (!existsSync(resolvedPath)) {
    if (ctx.verify) {
      ctx.stats.outOfDate++;
      console.log(
        `⚠ Out of date (missing): ${relative(PACKAGE_ROOT, resolvedPath)}`,
      );
      return;
    }
    mkdirSync(dirname(resolvedPath), { recursive: true });
    writeFileSync(resolvedPath, normalized, 'utf-8');
    ctx.stats.written++;
    console.log(`✓ Wrote ${relative(PACKAGE_ROOT, resolvedPath)}`);
    return;
  }

  const existing = normalizeContent(readFileSync(resolvedPath, 'utf-8'));
  if (existing === normalized) {
    ctx.stats.unchanged++;
    return;
  }

  if (ctx.verify) {
    ctx.stats.outOfDate++;
    console.log(`⚠ Out of date: ${relative(PACKAGE_ROOT, resolvedPath)}`);
    return;
  }

  writeFileSync(resolvedPath, normalized, 'utf-8');
  ctx.stats.written++;
  console.log(`✓ Wrote ${relative(PACKAGE_ROOT, resolvedPath)}`);
}

function cleanStaleGeneratedFiles(ctx: SyncContext): void {
  if (!existsSync(GENERATED_DIR)) {
    return;
  }

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    for (const entry of entries) {
      const fullPath = resolve(join(dir, entry.name));

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      const ext = extname(entry.name);
      const isOwned =
        ext === '.json' || ext === '.ts' || entry.name === '__init__.py';
      if (!isOwned || ctx.plannedPaths.has(fullPath)) {
        continue;
      }

      if (ctx.verify) {
        ctx.stats.outOfDate++;
        console.log(
          `⚠ Out of date (stale): ${relative(PACKAGE_ROOT, fullPath)}`,
        );
        continue;
      }

      rmSync(fullPath);
      ctx.stats.deleted++;
      console.log(`✗ Deleted stale ${relative(PACKAGE_ROOT, fullPath)}`);
    }
  }

  walk(GENERATED_DIR);
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
      } else if (
        entry.name.endsWith('.json') ||
        entry.name.endsWith('.csv') ||
        (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts'))
      ) {
        files.push(relPath);
      }
    }
  }

  scanDir(SOURCE_DIR);
  return files.sort((a, b) => a.localeCompare(b));
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

function trimUnderscores(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '_') {
    start++;
  }
  while (end > start && value[end - 1] === '_') {
    end--;
  }
  return value.slice(start, end);
}

/**
 * Convert kebab-case or mixed case to Python snake_case
 */
function toSnakeCase(str: string): string {
  return trimUnderscores(
    str
      .replace(/([A-Z])/g, '_$1')
      .replace(/[-_]+/g, '_')
      .toLowerCase(),
  );
}

/**
 * Infer export name from TS file content
 */
async function inferTSExportName(tsPath: string): Promise<string> {
  const fullPath = join(SOURCE_DIR, tsPath);
  if (!existsSync(fullPath)) {
    return `default${pascalCase(basename(tsPath, '.ts'))}`;
  }

  const content = readFileSync(fullPath, 'utf-8');
  // Look for: export const defaultAccountTypes = ...
  const exportMatch = EXPORT_CONST_PATTERN.exec(content);
  if (exportMatch?.[1]) {
    return exportMatch[1];
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

    return exports.sort((a, b) => a.localeCompare(b));
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
): Promise<ZodType | null> {
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

    return schema as ZodType;
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
  const defaultEnabled = hasSchema;
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
        .map((err: ParseError) => `Row ${err.row}: ${err.message}`)
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
  ctx: SyncContext,
  config: ResolvedConfig,
  data: any,
  exportName?: string,
): Promise<JsonOutputRef> {
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

  // Check file size for large files
  const sourcePath = join(SOURCE_DIR, config.source);
  const fileSize = existsSync(sourcePath) ? statSync(sourcePath).size : 0;

  if (config.format === 'json' && fileSize > LARGE_FILE_THRESHOLD) {
    const content = readFileSync(sourcePath, 'utf-8');
    syncFile(ctx, outputFile, content);
    console.log(`⏩ Large file synced (${fileSize} bytes)`);
  } else {
    // Keep generated JSON stable with Prettier/lint-staged output.
    const content = await format(JSON.stringify(data), {
      parser: 'json',
      trailingComma: 'none',
      printWidth: 80,
    });
    syncFile(ctx, outputFile, content);
  }

  return { domain: config.domain, filename: outputFilename };
}

/**
 * Generate TypeScript re-export
 * For TS sources: imports directly from TS source (no JSON dependency)
 * For JSON/CSV sources: imports from generated JSON
 * Uses modern ESM with { type: 'json' } syntax
 */
async function generateTSReExport(
  ctx: SyncContext,
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

  syncFile(ctx, outputFile, tsContent);
}

/**
 * Main processing function
 */
async function processFile(
  ctx: SyncContext,
  config: ResolvedConfig,
): Promise<JsonOutputRef> {
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
    const jsonOutput = await generateJSON(ctx, config, data, exportName);

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

      await generateTSReExport(ctx, config, data, exportName);
    }

    return jsonOutput;
  } catch (error) {
    console.error(`✗ Error processing ${config.source}: ${error}`);
    throw error;
  }
}

function ensurePythonInitFiles(ctx: SyncContext, domains: string[]): void {
  const sortedDomains = [...domains].sort((a, b) => a.localeCompare(b));
  const initFiles = [
    {
      path: join(GENERATED_DIR, '__init__.py'),
      content: '"""Generated data files."""\n',
    },
  ];

  for (const domain of sortedDomains) {
    initFiles.push({
      path: join(JSON_OUTPUT_DIR, domain, '__init__.py'),
      content: `"""${domain.charAt(0).toUpperCase() + domain.slice(1)}-related data files."""\n`,
    });
  }

  for (const { path, content } of initFiles) {
    syncFile(ctx, path, content);
  }
}

function generatePythonDataHelpers(
  ctx: SyncContext,
  jsonOutputs: JsonOutputRef[],
): void {
  if (jsonOutputs.length === 0) {
    console.log('⚠ No JSON files found to generate helpers for');
    return;
  }

  const helpers: Array<{
    name: string;
    getterName: string;
    domain: string;
    filename: string;
  }> = [];

  const sortedOutputs = [...jsonOutputs].sort((a, b) => {
    if (a.domain !== b.domain) {
      return a.domain.localeCompare(b.domain);
    }
    return a.filename.localeCompare(b.filename);
  });

  for (const { domain, filename } of sortedOutputs) {
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

  syncFile(ctx, jsonInitPath, jsonInitContent);

  // Generate data/__init__.py
  const dataInitPath = join(DATA_ROOT, '__init__.py');
  const imports: string[] = [];
  const exports: string[] = [];

  for (const helper of helpers) {
    imports.push(`    ${helper.getterName},`, `    ${helper.name},`);
    exports.push(`    "${helper.getterName}",`, `    "${helper.name}",`);
  }

  const dataInitContent = `"""Data files shared between TypeScript and Python."""

from .generated.json import (
${imports.join('\n')}
)

__all__ = [
${exports.join('\n')}
]
`;

  syncFile(ctx, dataInitPath, dataInitContent);
}

/**
 * Generate main data index file
 */
async function generateDataIndex(
  ctx: SyncContext,
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

  syncFile(ctx, indexPath, content);
}

function logAutoDiscovery(
  sourcePath: string,
  configs: ResolvedConfig[],
  explicit: MinimalConfig | undefined,
): void {
  if (explicit) {
    return;
  }

  const exportCount = configs.length;
  if (exportCount > 1) {
    console.log(`ℹ Auto-discovered: ${sourcePath} (${exportCount} exports)`);
    return;
  }

  console.log(`ℹ Auto-discovered: ${sourcePath} (using defaults)`);
}

async function resolveAllConfigs(
  discoveredFiles: string[],
  explicitConfig: Map<string, MinimalConfig>,
): Promise<ResolvedConfig[]> {
  const resolvedConfigs: ResolvedConfig[] = [];

  for (const sourcePath of discoveredFiles) {
    const explicit = explicitConfig.get(sourcePath);
    const configs = await resolveConfigs(explicit, sourcePath);
    resolvedConfigs.push(...configs);
    logAutoDiscovery(sourcePath, configs, explicit);
  }

  return resolvedConfigs;
}

function toGeneratedFile(config: ResolvedConfig): GeneratedFile {
  const fileBasename =
    config.format === 'ts' && config.typescript.exportName
      ? config.typescript.exportName
      : basename(config.source, extname(config.source));

  if (config.typescript.enabled) {
    return {
      domain: config.domain,
      basename: fileBasename,
      hasTSExport: true,
      tsExportName: config.typescript.exportName,
    };
  }

  return {
    domain: config.domain,
    basename: fileBasename,
    hasTSExport: false,
  };
}

async function processAllConfigs(
  ctx: SyncContext,
  resolvedConfigs: ResolvedConfig[],
): Promise<{
  generatedFiles: GeneratedFile[];
  jsonOutputs: JsonOutputRef[];
  domains: Set<string>;
}> {
  const generatedFiles: GeneratedFile[] = [];
  const jsonOutputs: JsonOutputRef[] = [];
  const domains = new Set<string>();

  for (const config of resolvedConfigs) {
    const jsonOutput = await processFile(ctx, config);
    jsonOutputs.push(jsonOutput);
    domains.add(config.domain);
    generatedFiles.push(toGeneratedFile(config));
  }

  return { generatedFiles, jsonOutputs, domains };
}

function printSyncSummary(ctx: SyncContext, verify: boolean): void {
  const mode = verify ? 'Verify' : 'Sync';
  const outOfDateSuffix = verify ? `, ${ctx.stats.outOfDate} out of date` : '';
  console.log(
    `✅ ${mode}: ${ctx.stats.written} written, ${ctx.stats.unchanged} unchanged, ${ctx.stats.deleted} deleted${outOfDateSuffix}`,
  );
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const verify = args.has('--verify');
  const clean = args.has('--clean');
  const ctx = createSyncContext(verify, clean);

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
  const resolvedConfigs = await resolveAllConfigs(
    discoveredFiles,
    explicitConfig,
  );

  console.log('Processing files...');
  const { generatedFiles, jsonOutputs, domains } = await processAllConfigs(
    ctx,
    resolvedConfigs,
  );

  console.log('Ensuring Python __init__.py files...');
  ensurePythonInitFiles(ctx, Array.from(domains));

  console.log('Generating Python data helpers...');
  generatePythonDataHelpers(ctx, jsonOutputs);

  console.log('Generating index file...');
  await generateDataIndex(ctx, generatedFiles);

  if (clean) {
    console.log('Cleaning stale generated files...');
    cleanStaleGeneratedFiles(ctx);
  }

  printSyncSummary(ctx, verify);

  if (verify && ctx.stats.outOfDate > 0) {
    process.exit(1);
  }
}

try {
  await main();
} catch (error) {
  console.error('Fatal error:', error);
  process.exit(1);
}
