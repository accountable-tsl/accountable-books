import '../config/env-loader.js';

import {
  BOOTSTRAP_PHASES,
  BootstrapPhaseExecutionError,
  resolveBootstrapPlan,
  runBootstrap,
} from '../src/bootstrap/index.js';
import { resolveFxSeedPackIdsFromEnv } from '../src/bootstrap/phases/fx-seeds.bootstrap.js';
import { knexClient } from '../src/db/knexClient.js';

import type {
  BootstrapPhase,
  RunBootstrapOptions,
} from '../src/bootstrap/index.js';

function getArgValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function parseCsvList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

function parsePhases(value: string | undefined): BootstrapPhase[] | undefined {
  const tokens = parseCsvList(value);
  if (tokens.length === 0) return undefined;

  const unique = new Set<BootstrapPhase>();
  for (const token of tokens) {
    if (!BOOTSTRAP_PHASES.includes(token as BootstrapPhase)) {
      throw new Error(
        `Invalid bootstrap phase "${token}". Allowed phases: ${BOOTSTRAP_PHASES.join(', ')}`,
      );
    }
    unique.add(token as BootstrapPhase);
  }

  return [...unique];
}

function buildOptions(): RunBootstrapOptions {
  const phases = parsePhases(getArgValue('phases'));
  const fxPacksArg = getArgValue('fx-packs');
  const fxPacksEnv = process.env.BOOTSTRAP_FX_SEED_PACKS;
  const fxSeedPackIds = resolveFxSeedPackIdsFromEnv(fxPacksArg ?? fxPacksEnv);

  return {
    phases,
    fxSeedPackIds: fxSeedPackIds.length > 0 ? fxSeedPackIds : undefined,
  };
}

async function run(): Promise<void> {
  const options = buildOptions();
  const plannedPhases = resolveBootstrapPlan(options);
  const isDryRun = process.argv.includes('--dry-run');

  if (isDryRun) {
    console.log(`Bootstrap plan: ${plannedPhases.join(', ')}`);
    if (options.fxSeedPackIds && options.fxSeedPackIds.length > 0) {
      console.log(`FX seed packs: ${options.fxSeedPackIds.join(', ')}`);
    }
    return;
  }

  const result = await runBootstrap(knexClient, options);
  console.log(`Bootstrap completed: ${result.phases.join(', ')}`);
  for (const execution of result.phaseExecutions) {
    console.log(
      `  phase ${execution.phase}: ${execution.status} (${execution.durationMs}ms)`,
    );
  }

  if (result.context.fxSeedResults && result.context.fxSeedResults.length > 0) {
    for (const item of result.context.fxSeedResults) {
      console.log(
        `  fx-pack ${item.packId}: upserted=${item.rowsUpserted} prepared=${item.rowsPrepared} read=${item.rowsRead}`,
      );
    }
  }
}

(async () => {
  let exitCode = 0;

  try {
    await run();
  } catch (error) {
    if (error instanceof BootstrapPhaseExecutionError) {
      for (const execution of error.phaseExecutions) {
        if (execution.status === 'failed') {
          console.error(
            `  phase ${execution.phase}: failed (${execution.durationMs}ms) - ${execution.errorMessage ?? 'unknown error'}`,
          );
          continue;
        }

        console.error(
          `  phase ${execution.phase}: success (${execution.durationMs}ms)`,
        );
      }
    }
    console.error('Bootstrap failed:', error);
    exitCode = 1;
  } finally {
    await knexClient.destroy();
  }

  process.exit(exitCode);
})();
