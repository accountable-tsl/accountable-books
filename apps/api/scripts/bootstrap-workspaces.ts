import '../config/env-loader.js';

import { knexClient } from '../src/db/knexClient.js';
import {
  bootstrapApplicationWorkspaces,
  isPlatformWorkspaceBootstrapped,
} from '../src/domains/companies/workspace-bootstrap.service.js';

const dryRun = process.argv.includes('--dry-run');

async function run(): Promise<void> {
  if (dryRun) {
    const platformBootstrapped =
      await isPlatformWorkspaceBootstrapped(knexClient);

    console.log(
      platformBootstrapped
        ? 'Workspace bootstrap status: platform workspace is present (dry-run only)'
        : 'Workspace bootstrap status: platform workspace is missing (dry-run only)',
    );
    console.log(
      'System firms are seeded via the same bootstrap command when run without --dry-run.',
    );
    return;
  }

  const result = await bootstrapApplicationWorkspaces(knexClient, {
    sideEffectMode: 'skip_jobs',
  });

  console.log(
    result.platform.action === 'provisioned'
      ? 'Platform workspace bootstrapped successfully'
      : 'Platform workspace reconciled',
  );
  console.log(`  platform_company: ${result.platform.companyId}`);
  console.log(`  admin_user:       ${result.platform.adminUserId}`);
  console.log(`  system_user:      ${result.platform.systemUserId}`);
  for (const firm of result.systemFirms.results) {
    console.log(`  ${firm.shortCode}: ${firm.action} (${firm.companyId})`);
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Workspace bootstrap failed:', err);
    process.exit(1);
  })
  .finally(() => {
    knexClient.destroy();
  });
