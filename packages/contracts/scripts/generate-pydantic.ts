#!/usr/bin/env node
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertFolder } from 'schemabridge';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const clean = args.has('--clean');
const verify = args.has('--verify');

const result = await convertFolder({
  sourceDir: `${ROOT_DIR}/accountable_contracts/schema/source`,
  outDir: `${ROOT_DIR}/accountable_contracts/schema/py`,
  target: 'pydantic',
  preserveStructure: false,
  generateInitFiles: true,
  registerTsLoader: true,
  trustedInput: true,
  clean,
  verify,
});

const mode = verify ? 'Verify' : 'Sync';
const outOfDateSuffix = verify ? `, ${result.outOfDate} out of date` : '';
console.log(
  `✅ ${mode}: ${result.written} written, ${result.unchanged} unchanged, ${result.deleted} deleted${outOfDateSuffix}`,
);

for (const warning of result.warnings) {
  console.warn(`⚠️  ${warning}`);
}

if (result.errors.length > 0) {
  for (const error of result.errors) {
    console.error(`❌ ${error}`);
  }
  process.exit(1);
}

if (verify && result.outOfDate > 0) {
  process.exit(1);
}
