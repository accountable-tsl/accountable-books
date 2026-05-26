import '../config/env-loader.js';

import { knexClient } from '../src/db/knexClient.js';
import {
  bootstrapPlatformWorkspace,
  isPlatformWorkspaceBootstrapped,
} from '../src/domains/companies/workspace-bootstrap.service.js';

const dryRun = process.argv.includes('--dry-run');

async function run(): Promise<void> {
  console.log('Checking platform workspace bootstrap status...');

  const alreadyBootstrapped = await isPlatformWorkspaceBootstrapped(knexClient);

  if (dryRun) {
    console.log(
      alreadyBootstrapped
        ? 'Platform workspace is already bootstrapped (dry-run — no changes made)'
        : 'Platform workspace is NOT yet bootstrapped (dry-run — no changes made)',
    );
    return;
  }

  const result = await bootstrapPlatformWorkspace(knexClient, {
    sideEffectMode: 'skip_jobs',
  });

  console.log(
    result.action === 'provisioned'
      ? 'Platform workspace bootstrapped successfully'
      : 'Platform workspace reconciled (was already bootstrapped)',
  );
  console.log(`  company_id:   ${result.companyId}`);
  console.log(`  admin_user:   ${result.adminUserId}`);
  console.log(`  system_user:  ${result.systemUserId}`);
}

(async () => {
  let exitCode = 0;
  try {
    await run();
  } catch (err) {
    console.error('Bootstrap failed:', err);
    exitCode = 1;
  } finally {
    await knexClient.destroy();
  }
  process.exit(exitCode);
})();
