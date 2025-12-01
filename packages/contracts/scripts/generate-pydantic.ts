#!/usr/bin/env node
// /**
//  * Automated script to generate Pydantic models from Zod schemas.
//  *
//  * This script:
//  * 1. Recursively scans all .ts files in schema/source/ directory (excluding index.ts)
//  * 2. Discovers all Zod schemas from those files
//  * 3. Converts them to JSON Schema using z.toJSONSchema()
//  * 4. Writes JSON Schema files to schema/json/
//  * 5. Spawns Python subprocess to generate Pydantic models
//  * 6. Outputs generated models to schema/py/
//  */

import { execSync } from 'child_process';
import path, { dirname } from 'path';
import { convertFolder } from 'schemabridge';
import { fileURLToPath } from 'url';
// import {
//   existsSync,
//   mkdirSync,
//   writeFileSync,
//   readdirSync,
//   statSync,
//   unlinkSync,
// } from 'fs';
// import { join, dirname, resolve, relative, extname, basename } from 'path';
// import { fileURLToPath } from 'url';
// import { z } from 'zod';
// const PACKAGE_ROOT = resolve(__dirname, '..');

// Paths
// const SCHEMA_ROOT = join(PACKAGE_ROOT, 'accountable_contracts', 'schema');
// const SCHEMA_TS_DIR = join(SCHEMA_ROOT, 'source'); // Only scan schema/source/ folder
// const JSON_SCHEMA_DIR = join(SCHEMA_ROOT, 'json');
// const PYTHON_OUTPUT_DIR = join(SCHEMA_ROOT, 'py');
// const PYTHON_SCRIPT = join(__dirname, 'generate_pydantic.py');

// interface SchemaInfo {
//   name: string;
//   schema: any;
//   jsonSchema: any;
// }
// const cmd = `schemabridge convert folder ${SCHEMA_TS_DIR} --out ${PYTHON_OUTPUT_DIR} --to pydantic`;

// Locate the file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../contracts');


// Remove previous generated files
// Let schemabridge handle the conversion
const result = await convertFolder({
  sourceDir: `${ROOT_DIR}/accountable_contracts/schema/source`,
  outDir: `${ROOT_DIR}/accountable_contracts/schema/py`,
  target: 'pydantic',
  preserveStructure: false, // --flat
  generateInitFiles: true, // --init
  registerTsLoader: true,
});

console.log(`✅ Converted ${result.files.length} schemas`);
for (const warning of result.warnings) {
  console.warn(`⚠️  ${warning}`);
}

// Make sure the relevant init files exist so the package works
// /**
//  * Check if a value is a Zod schema
//  */
// function isZodSchema(value: any): value is z.ZodTypeAny {
//   if (!value || typeof value !== 'object') {
//     return false;
//   }
//   // Zod schemas have a _def property or a parse method
//   return '_def' in value || typeof value.parse === 'function';
// }

// /**
//  * Check if an export name should be skipped
//  */
// function shouldSkipExport(name: string, value: any): boolean {
//   // Skip default exports
//   if (name === 'default') {
//     return true;
//   }

//   // Skip TypeScript types (they end with 'Type' or are type-only exports)
//   if (name.endsWith('Type') && typeof value !== 'object') {
//     return true;
//   }

//   // Skip patterns (they're usually RegExp or strings)
//   if (name.includes('Pattern') || name.includes('pattern')) {
//     return true;
//   }

//   // Skip non-object values (primitives, functions that aren't schemas)
//   if (typeof value !== 'object' || value === null) {
//     return true;
//   }

//   // Skip if it's not a Zod schema
//   if (!isZodSchema(value)) {
//     return true;
//   }

//   return false;
// }

// /**
//  * Recursively find all TypeScript files in a directory, excluding index.ts files
//  */
// function findTypeScriptFiles(
//   dir: string,
//   baseDir: string = dir,
//   fileList: string[] = [],
// ): string[] {
//   const files = readdirSync(dir);

//   for (const file of files) {
//     const filePath = join(dir, file);
//     const stat = statSync(filePath);

//     if (stat.isDirectory()) {
//       // Skip certain directories (but allow recursion within schema/source/)
//       if (file === 'node_modules' || file === 'py' || file === 'json') {
//         continue;
//       }
//       // Continue recursion for other directories (allows subdirectories in schema/source/)
//       findTypeScriptFiles(filePath, baseDir, fileList);
//     } else if (stat.isFile() && extname(file) === '.ts') {
//       // Exclude index.ts files (barrel exports)
//       if (basename(file) === 'index.ts') {
//         continue;
//       }
//       fileList.push(filePath);
//     }
//   }

//   return fileList;
// }

// /**
//  * Convert a file path to a module import path relative to scripts/ directory
//  * e.g., /path/to/accountable_contracts/schema/source/categorization/enrichment.ts -> ../accountable_contracts/schema/source/categorization/enrichment.js
//  */
// function filePathToImportPath(filePath: string, schemaTsDir: string): string {
//   // Get path relative to schema/source directory
//   const relativePath = relative(schemaTsDir, filePath);
//   // Remove .ts extension and add .js (for ES modules)
//   const importPath = relativePath.replace(/\.ts$/, '.js');
//   // Since we're in scripts/ directory, we need to go up one level to reach accountable_contracts/schema/source/
//   return `../accountable_contracts/schema/source/${importPath}`.replace(
//     /\\/g,
//     '/',
//   );
// }

// /**
//  * Dynamically collect all Zod schemas from the schema/source directory
//  * Recursively scans all .ts files (excluding index.ts) and discovers Zod schemas
//  */
// async function collectSchemas(): Promise<SchemaInfo[]> {
//   const schemas: SchemaInfo[] = [];
//   const processedSchemas = new Set<string>(); // Track to avoid duplicates

//   try {
//     // Check if schema/source directory exists
//     if (!existsSync(SCHEMA_TS_DIR)) {
//       console.warn(`⚠ Schema directory not found: ${SCHEMA_TS_DIR}`);
//       console.warn('Creating schema/source directory...');
//       mkdirSync(SCHEMA_TS_DIR, { recursive: true });
//       console.log(
//         '✓ Created schema/source directory. Add your schema files there.',
//       );
//       return schemas;
//     }

//     // Find all TypeScript files in schema/source directory (excluding index.ts)
//     const tsFiles = findTypeScriptFiles(SCHEMA_TS_DIR, SCHEMA_TS_DIR);
//     console.log(
//       `📁 Found ${tsFiles.length} TypeScript files to scan in schema/source/\n`,
//     );

//     // Process each file
//     for (const filePath of tsFiles) {
//       const relativePath = relative(SCHEMA_TS_DIR, filePath);
//       const importPath = filePathToImportPath(filePath, SCHEMA_TS_DIR);

//       try {
//         // Dynamically import the module
//         const moduleExports = await import(importPath);

//         // Scan all exports from this module
//         for (const [exportName, exportValue] of Object.entries(moduleExports)) {
//           // Skip if we've already processed this schema
//           if (processedSchemas.has(exportName)) {
//             continue;
//           }

//           // Skip non-schema exports
//           if (shouldSkipExport(exportName, exportValue)) {
//             continue;
//           }

//           // Process the Zod schema
//           try {
//             const jsonSchema = z.toJSONSchema(exportValue as z.ZodTypeAny);

//             if (jsonSchema) {
//               // Use a clean name for the schema (remove 'Schema' suffix if present for cleaner Python class names)
//               const schemaName = exportName.endsWith('Schema')
//                 ? exportName.slice(0, -6)
//                 : exportName;

//               schemas.push({
//                 name: schemaName,
//                 schema: exportValue,
//                 jsonSchema: {
//                   $schema: 'http://json-schema.org/draft-07/schema#',
//                   title: schemaName,
//                   ...jsonSchema,
//                 },
//               });

//               processedSchemas.add(exportName);
//               console.log(
//                 `✓ Discovered schema: ${exportName} (from ${relativePath})`,
//               );
//             }
//           } catch (error) {
//             console.warn(
//               `⚠ Error processing ${exportName} from ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
//             );
//           }
//         }
//       } catch (error) {
//         console.warn(
//           `⚠ Error importing ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
//         );
//       }
//     }
//   } catch (error) {
//     console.error(
//       `Error collecting schemas: ${error instanceof Error ? error.message : String(error)}`,
//     );
//     throw error;
//   }

//   return schemas;
// }

// /**
//  * Write JSON Schema files to disk
//  */
// function writeJsonSchemaFiles(schemas: SchemaInfo[]): string[] {
//   // Create JSON schema directory
//   if (!existsSync(JSON_SCHEMA_DIR)) {
//     mkdirSync(JSON_SCHEMA_DIR, { recursive: true });
//   }

//   const jsonSchemaFiles: string[] = [];

//   for (const { name, jsonSchema } of schemas) {
//     const filename = `${name
//       .toLowerCase()
//       .replace(/([A-Z])/g, '_$1')
//       .toLowerCase()}.json`;
//     const filepath = join(JSON_SCHEMA_DIR, filename);

//     writeFileSync(filepath, JSON.stringify(jsonSchema, null, 2), 'utf-8');
//     jsonSchemaFiles.push(filepath);
//     console.log(`✓ Wrote JSON Schema: ${filename}`);
//   }

//   return jsonSchemaFiles;
// }

// /**
//  * Run Python script to generate Pydantic models
//  */
// function generatePydanticModels(jsonSchemaFiles: string[]): void {
//   if (jsonSchemaFiles.length === 0) {
//     console.warn('⚠ No JSON Schema files to process');
//     return;
//   }

//   // Create output directory
//   if (!existsSync(PYTHON_OUTPUT_DIR)) {
//     mkdirSync(PYTHON_OUTPUT_DIR, { recursive: true });
//   }

//   // Check if Python script exists
//   if (!existsSync(PYTHON_SCRIPT)) {
//     throw new Error(`Python script not found: ${PYTHON_SCRIPT}`);
//   }

//   // Build command
//   const pythonCmd = `python3 "${PYTHON_SCRIPT}" --output-dir "${PYTHON_OUTPUT_DIR}" ${jsonSchemaFiles.map((f) => `"${f}"`).join(' ')}`;

//   console.log('\n🔄 Generating Pydantic models...');
//   console.log(`Running: ${pythonCmd}\n`);

//   try {
//     execSync(pythonCmd, {
//       cwd: PACKAGE_ROOT,
//       stdio: 'inherit',
//       env: {
//         ...process.env,
//         PYTHONPATH: PACKAGE_ROOT,
//       },
//     });
//     console.log('\n✓ Pydantic models generated successfully');
//   } catch (error) {
//     console.error('\n✗ Error generating Pydantic models:', error);
//     throw error;
//   }
// }

// /**
//  * Clean existing generated files (except __init__.py)
//  */
// function cleanGeneratedFiles(): void {
//   let cleanedCount = 0;

//   // Clean JSON Schema directory
//   if (existsSync(JSON_SCHEMA_DIR)) {
//     const jsonFiles = readdirSync(JSON_SCHEMA_DIR).filter((f) =>
//       f.endsWith('.json'),
//     );
//     for (const file of jsonFiles) {
//       unlinkSync(join(JSON_SCHEMA_DIR, file));
//       cleanedCount++;
//     }
//     if (jsonFiles.length > 0) {
//       console.log(`🗑️  Cleaned ${jsonFiles.length} JSON Schema files`);
//     }
//   }

//   // Clean Python output directory (except __init__.py)
//   if (existsSync(PYTHON_OUTPUT_DIR)) {
//     const pyFiles = readdirSync(PYTHON_OUTPUT_DIR).filter(
//       (f) => f.endsWith('.py') && f !== '__init__.py',
//     );
//     for (const file of pyFiles) {
//       unlinkSync(join(PYTHON_OUTPUT_DIR, file));
//       cleanedCount++;
//     }
//     if (pyFiles.length > 0) {
//       console.log(`🗑️  Cleaned ${pyFiles.length} Python files`);
//     }
//   }

//   if (cleanedCount === 0) {
//     console.log('✨ No existing files to clean');
//   }
// }

// /**
//  * Main execution
//  */
// async function main() {
//   // Parse CLI arguments
//   const args = process.argv.slice(2);
//   const noClean = args.includes('--no-clean');

//   console.log('🚀 Starting Pydantic model generation from Zod schemas...\n');

//   try {
//     // Step 0: Clean existing files (unless --no-clean flag is provided)
//     if (!noClean) {
//       console.log('🧹 Cleaning existing generated files...');
//       cleanGeneratedFiles();
//       console.log();
//     } else {
//       console.log('⏩ Skipping clean (--no-clean flag provided)\n');
//     }

//     // Step 1: Collect all Zod schemas
//     console.log('📦 Collecting Zod schemas...');
//     const schemas = await collectSchemas();
//     console.log(`Found ${schemas.length} schemas\n`);

//     if (schemas.length === 0) {
//       console.warn(
//         '⚠ No schemas found. Make sure schemas are exported from schema/ directory.',
//       );
//       return;
//     }

//     // Step 2: Convert to JSON Schema and write files
//     console.log('📝 Converting to JSON Schema...');
//     const jsonSchemaFiles = writeJsonSchemaFiles(schemas);
//     console.log(`Generated ${jsonSchemaFiles.length} JSON Schema files\n`);

//     // Step 3: Generate Pydantic models (includes __init__.py generation)
//     generatePydanticModels(jsonSchemaFiles);

//     console.log('\n✅ Generation complete!');
//     console.log(`📁 Output directory: ${PYTHON_OUTPUT_DIR}`);
//   } catch (error) {
//     console.error('\n❌ Generation failed:', error);
//     process.exit(1);
//   }
// }

// // Run if executed directly
// if (import.meta.url === `file://${process.argv[1]}`) {
//   main().catch((error) => {
//     console.error('Fatal error:', error);
//     process.exit(1);
//   });
// }

// export { main };
