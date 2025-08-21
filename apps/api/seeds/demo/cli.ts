#!/usr/bin/env tsx
import { knexClient } from '../../src/db/knexClient';
import { applyAll, addStep, purge, list, status } from './engine/runner';

type Argv = {
  cmd: string;
  all: boolean;
  country?: 'US' | 'NG';
  type?: 'individual' | 'business' | 'accounting_firm';
  company?: string;
  step?: 'base' | 'contacts' | 'projects' | 'bank-accounts' | 'bank-transactions';
  parallel?: boolean;
  bail?: boolean;
  config?: string;
};

function parseArgs(): Argv {
  const [cmd = ''] = process.argv.slice(2, 3);
  const rest = process.argv.slice(3);
  const get = (f: string) => {
    const i = rest.indexOf(f);
    return i >= 0 ? (rest[i + 1] as string | undefined) : undefined;
  };
  const has = (f: string) => rest.includes(f);
  const country = get('--country') as any as 'US' | 'NG' | undefined;
  const type = get('--type') as any as 'individual' | 'business' | 'accounting_firm' | undefined;
  const company = get('--company');
  const step = get('--step') as any as Argv['step'];
  const all = has('--all');
  const parallel = has('--parallel');
  const bail = has('--bail');
  const config = get('--config');
  return { cmd, all, country, type, company, step, parallel, bail, config } as Argv;
}

async function main() {
  const argv = parseArgs();
  const filters = { country: argv.country, type: argv.type, company: argv.company } as any;
  const opts = { parallel: argv.parallel, bail: argv.bail, configPath: argv.config } as any;

  if (argv.cmd === 'apply') {
    const f = argv.all ? {} : filters;
    await applyAll(knexClient, f, undefined, opts);
  } else if (argv.cmd === 'add') {
    if (!argv.step) throw new Error('Missing --step');
    const f = argv.all ? {} : filters;
    await addStep(knexClient, f, argv.step, opts);
  } else if (argv.cmd === 'purge') {
    const f = argv.all ? {} : filters;
    await purge(knexClient, { ...f, step: argv.step });
  } else if (argv.cmd === 'list') {
    await list();
  } else if (argv.cmd === 'status') {
    const f = argv.all ? {} : filters;
    await status(f, { configPath: argv.config });
  } else {
    printHelp();
  }

  await knexClient.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

function printHelp() {
  console.log(`
Usage:
  tsx apps/api/seeds/demo/cli.ts <command> [options]

Commands:
  apply     Apply seeds to targets
  add       Apply a single step to targets
  purge     Purge artifacts for targets
  list      List seed runs
  status    Show applied runs for targets

Options:
  --all                     Target all scenarios
  --country US|NG           Filter by country
  --type individual|business|accounting_firm
  --company <shortCode>     Target a single company
  --step base|contacts|projects|bank-accounts|bank-transactions
  --parallel                Run scenarios in parallel
  --bail                    Stop on first error
  --config <path>           Use custom scenarios JSON

Examples:
  pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts apply --all
  pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts apply --country US --parallel
  pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts add --step bank-accounts --type business
  pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts purge --company indDemoNG --bail
  pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts status --country NG
`);
}
