import '../config/env-loader.js';

import { resolveBootstrapPlan, runBootstrap } from '../src/bootstrap/index.js';
import { knexClient } from '../src/db/knexClient.js';

import type { BootstrapPhase } from '../src/bootstrap/index.js';

const dryRun = process.argv.includes('--dry-run');
const phases: BootstrapPhase[] = ['canonical-workspaces'];

async function run(): Promise<void> {
  if (dryRun) {
    console.log(
      `Platform workspace bootstrap plan: ${resolveBootstrapPlan({ phases }).join(', ')}`,
    );
    return;
  }

  const result = await runBootstrap(knexClient, { phases });
  const platform = result.context.canonicalWorkspacesByKey?.platform;

  console.log('Platform workspace bootstrap completed');
  console.log(`  action:     ${platform?.action ?? 'unknown'}`);
  console.log(`  company_id: ${platform?.id ?? 'unknown'}`);
  console.log(`  admin_user: ${result.context.canonicalWorkspaceAdminUserId}`);
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
