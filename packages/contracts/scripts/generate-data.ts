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

import { execSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  statSync,
  copyFileSync,
  rmSync,
} from 'fs';
import { join, dirname, resolve, relative, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import type { ZodSchema } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, '..');

// Paths
const DATA_ROOT = join(PACKAGE_ROOT, 'data');
const SOURCE_DIR = join(DATA_ROOT, 'source');
const GENERATED_DIR = join(DATA_ROOT, 'generated');
const JSON_OUTPUT_DIR = join(GENERATED_DIR, 'json');
const TS_OUTPUT_DIR = join(GENERATED_DIR, 'ts');
const CONFIG_PATH = join(DATA_ROOT, 'config.ts');
const SCHEMA_TS_DIR = join(PACKAGE_ROOT, 'schema', 'ts');

// Large file threshold (1MB)
const LARGE_FILE_THRESHOLD = 1_000_000;

interface MinimalConfig {
  source: string; // Relative to data/source/
  schema?: {
    path: string; // Relative to schema/ts/
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
 * Load Zod schema from schema/ts/
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

    const schemaModule = await import(`../schema/ts/${schemaPath}.js`);
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
 */
async function resolveConfig(
  minimalConfig: MinimalConfig | undefined,
  sourcePath: string,
): Promise<ResolvedConfig> {
  const format = detectFormat(sourcePath);
  const domain = detectDomain(sourcePath);
  const fileBasename = basename(sourcePath, extname(sourcePath));

  // Infer export name
  let exportName: string;
  if (minimalConfig?.typescript?.exportName) {
    exportName = minimalConfig.typescript.exportName;
  } else if (format === 'ts') {
    exportName = await inferTSExportName(sourcePath);
  } else {
    exportName = camelCase(fileBasename);
  }

  // Infer type name
  const typeName =
    minimalConfig?.typescript?.typeName || pascalCase(exportName);

  // Determine if TS generation should be enabled
  const hasSchema = minimalConfig?.schema !== undefined;
  const defaultEnabled = format === 'ts' || hasSchema;
  const enabled = minimalConfig?.typescript?.enabled ?? defaultEnabled;

  // Determine if validation should be enabled
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
    exports: minimalConfig?.exports,
  };
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
 */
function generateJSON(config: ResolvedConfig, data: any): void {
  const outputDir = join(JSON_OUTPUT_DIR, config.domain);
  const outputFile = join(
    outputDir,
    `${basename(config.source, extname(config.source))}.json`,
  );

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
    // Normal processing with pretty-printing
    writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf-8');
  }

  console.log(`✓ Generated ${relative(PACKAGE_ROOT, outputFile)}`);
}

/**
 * Generate TypeScript re-export
 */
async function generateTSReExport(
  config: ResolvedConfig,
  data: any,
): Promise<void> {
  const outputDir = join(TS_OUTPUT_DIR, config.domain);
  const outputFile = join(
    outputDir,
    `${basename(config.source, extname(config.source))}.ts`,
  );

  // Ensure directory exists
  mkdirSync(outputDir, { recursive: true });

  const jsonRelativePath = `../../json/${config.domain}/${basename(
    config.source,
    extname(config.source),
  )}.json`;

  let tsContent: string;

  if (config.typescript.validate && config.schema) {
    // Generate with schema validation
    const schemaPath = config.schema.path;
    const schemaExport = config.schema.exportName;

    tsContent = `import { ${schemaExport} } from '../../../schema/ts/${schemaPath}.js';
import data from '${jsonRelativePath}' assert { type: 'json' };

export const ${config.typescript.exportName} = ${schemaExport}.parse(data);
export type ${config.typescript.typeName} = typeof ${config.typescript.exportName}[number];
`;
  } else {
    // Generate without validation
    tsContent = `import data from '${jsonRelativePath}' assert { type: 'json' };

export const ${config.typescript.exportName} = data;
// Note: No type safety - add schema to config.ts to enable validation
`;
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
    let exportName: string;

    switch (config.format) {
      case 'ts': {
        const tsResult = await processTSFile(config);
        data = tsResult.data;
        exportName = tsResult.exportName;
        break;
      }
      case 'json':
        data = processJSONFile(config);
        break;
      case 'csv':
        data = processCSVFile(config);
        break;
    }

    // Step 2: Generate JSON (always)
    generateJSON(config, data);

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

      await generateTSReExport(config, data);
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
 */
function ensurePythonInitFiles(domains: string[]): void {
  const initFiles = [
    {
      path: join(GENERATED_DIR, '__init__.py'),
      content: '"""Generated data files."""\n',
    },
    {
      path: join(JSON_OUTPUT_DIR, '__init__.py'),
      content: '"""JSON data files."""\n',
    },
  ];

  // Add domain-specific __init__.py files
  for (const domain of domains) {
    initFiles.push({
      path: join(JSON_OUTPUT_DIR, domain, '__init__.py'),
      content: `"""${domain.charAt(0).toUpperCase() + domain.slice(1)}-related data files."""\n`,
    });
  }

  // Ensure data/__init__.py exists (outside generated, so not cleaned)
  const dataInitPath = join(DATA_ROOT, '__init__.py');
  if (!existsSync(dataInitPath)) {
    writeFileSync(
      dataInitPath,
      '"""Data files shared between TypeScript and Python."""\n',
      'utf-8',
    );
    console.log(`✓ Created ${relative(PACKAGE_ROOT, dataInitPath)}`);
  }

  // Create all __init__.py files
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
 * Generate main data index file
 */
function generateDataIndex(generatedFiles: GeneratedFile[]): void {
  const indexPath = join(DATA_ROOT, 'index.ts');

  const tsExports: string[] = [];
  const jsonExports: string[] = [];

  // Group by domain for better organization
  const byDomain = new Map<string, GeneratedFile[]>();
  for (const file of generatedFiles) {
    if (!byDomain.has(file.domain)) {
      byDomain.set(file.domain, []);
    }
    byDomain.get(file.domain)!.push(file);
  }

  // Generate exports
  for (const [domain, files] of byDomain.entries()) {
    for (const file of files) {
      if (file.hasTSExport && file.tsExportName) {
        // TypeScript export (typed)
        tsExports.push(
          `export * from './generated/ts/${domain}/${file.basename}.js';`,
        );

        // JSON export (direct access)
        jsonExports.push(
          `export { default as ${file.tsExportName}Json } from './generated/json/${domain}/${file.basename}.json' assert { type: 'json' };`,
        );
      } else {
        // Only JSON export (no TS file generated)
        const jsonExportName = camelCase(file.basename);
        jsonExports.push(
          `export { default as ${jsonExportName}Json } from './generated/json/${domain}/${file.basename}.json' assert { type: 'json' };`,
        );
      }
    }
  }

  const content = `/**
 * Generated data index - exports all data files.
 * 
 * This file is auto-generated by scripts/generate-data.ts
 * Do not edit manually.
 */

// TypeScript exports (typed, validated if schema exists)
${tsExports.join('\n')}
${jsonExports.length > 0 ? '\n// JSON exports\n' + jsonExports.join('\n') : ''}
`;

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
    const resolved = await resolveConfig(explicit, sourcePath);
    resolvedConfigs.push(resolved);

    if (!explicit) {
      console.log(`ℹ Auto-discovered: ${sourcePath} (using defaults)`);
    }
  }

  console.log('Processing files...');
  const generatedFiles: GeneratedFile[] = [];
  const domains = new Set<string>();

  for (const config of resolvedConfigs) {
    await processFile(config);
    domains.add(config.domain);

    // Track generated files for index
    const fileBasename = basename(config.source, extname(config.source));
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

  console.log('Generating index file...');
  generateDataIndex(generatedFiles);

  console.log('✓ Data generation complete');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
