#!/usr/bin/env node
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { convertFolder } from 'schemabridge';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../contracts');

// Remove previous generated files if no --no-clean flag
// if (!process.argv.includes('--no-clean')) {
// rm -rf py folder or something
// }

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
