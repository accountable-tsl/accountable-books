import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { knexClient } from '../src/db/knexClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runViewMigration() {
  try {
    console.log('Dropping existing view (if it exists)...');
    await knexClient.raw(
      'DROP VIEW IF EXISTS categorization_engine_view CASCADE;',
    );

    console.log('Reading categorization_engine_view.sql...');
    const viewSql = readFileSync(
      join(__dirname, '../migrations/views-sql/categorization_engine_view.sql'),
      'utf-8',
    );

    console.log('Executing view SQL...');
    await knexClient.raw(viewSql);

    console.log('✅ View migration completed successfully!');
  } catch (error) {
    console.error('❌ View migration failed:', error);
    process.exit(1);
  } finally {
    await knexClient.destroy();
  }
}

runViewMigration();
