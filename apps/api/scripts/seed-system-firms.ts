import '../config/env-loader.js';

import { resolveBootstrapPlan, runBootstrap } from '../src/bootstrap/index.js';
import { knexClient } from '../src/db/knexClient.js';

import type { BootstrapPhase } from '../src/bootstrap/index.js';

const dryRun = process.argv.includes('--dry-run');
const phases: BootstrapPhase[] = ['canonical-workspaces'];

async function run(): Promise<void> {
  if (dryRun) {
    console.log(
      `System firm bootstrap plan: ${resolveBootstrapPlan({ phases }).join(', ')}`,
    );
    return;
  }

  const result = await runBootstrap(knexClient, { phases });
  const workspaces = Object.values(
    result.context.canonicalWorkspacesByKey ?? {},
  ).filter((workspace) => workspace.workspace_class === 'partner');

  console.log(
    `System firm bootstrap complete (admin: ${result.context.canonicalWorkspaceAdminUserId})`,
  );
  for (const workspace of workspaces) {
    console.log(
      `  ${workspace.key}: ${workspace.action} (${workspace.id}, ${workspace.short_code})`,
    );
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
