import '../config/env-loader.js';

import { knexClient } from '../src/db/knexClient.js';
import { seedSystemFirms } from '../src/domains/companies/workspace-bootstrap.service.js';

const dryRun = process.argv.includes('--dry-run');

async function run(): Promise<void> {
  if (dryRun) {
    console.log(
      'System firm bootstrap dry-run is not yet implemented. Run without --dry-run to reconcile firms.',
    );
    return;
  }

  const result = await seedSystemFirms(knexClient, {
    sideEffectMode: 'skip_jobs',
  });

  console.log(`System firm bootstrap complete (admin: ${result.adminUserId})`);
  for (const entry of result.results) {
    console.log(`  ${entry.shortCode}: ${entry.action} (${entry.companyId})`);
  }
}

(async () => {
  let exitCode = 0;
  try {
    await run();
  } catch (err) {
    console.error('System firm bootstrap failed:', err);
    exitCode = 1;
  } finally {
    await knexClient.destroy();
  }
  process.exit(exitCode);
})();
