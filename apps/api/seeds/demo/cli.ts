#!/usr/bin/env tsx

import knex from 'knex';
import { createDemoSeedRunner } from './engine/runner.js';
import { runtimeKnexConfig } from '../../knexfile.js';
import { DemoFilter, COUNTRY_CODES, COMPANY_TYPES, DemoCompanyType } from './shared/config.js';

// Create knex instance for the CLI
const knexClient = knex(runtimeKnexConfig);

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

function parseFilters(args: string[]): DemoFilter | undefined {
  const filters: DemoFilter = {};
  let hasFilters = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--country' && args[i + 1]) {
      const countries = args[i + 1].split(',') as Array<keyof typeof COUNTRY_CODES>;
      filters.countryCodes = countries.filter((c) => c in COUNTRY_CODES);
      hasFilters = true;
      i++; // skip next arg
    }

    if (arg === '--type' && args[i + 1]) {
      const types = args[i + 1].split(',');
      filters.companyTypes = types
        .map((t) => {
          const upperType = t.toUpperCase() as keyof typeof COMPANY_TYPES;
          if (upperType in COMPANY_TYPES) {
            return COMPANY_TYPES[upperType];
          }
          // Also check if it's already a valid company type value
          const validTypes = Object.values(COMPANY_TYPES) as string[];
          if (validTypes.includes(t)) {
            return t as DemoCompanyType;
          }
          return null;
        })
        .filter((t): t is DemoCompanyType => t !== null);
      hasFilters = true;
      i++; // skip next arg
    }

    if (arg === '--company' && args[i + 1]) {
      filters.companyIds = args[i + 1].split(',');
      hasFilters = true;
      i++; // skip next arg
    }
  }

  return hasFilters ? filters : undefined;
}

function parseOptions(args: string[]) {
  return {
    parallel: args.includes('--parallel'),
    dryRun: args.includes('--dry-run'),
    steps: args.includes('--steps') ? args[args.indexOf('--steps') + 1]?.split(',') : undefined,
  };
}

function showHelp() {
  console.log(`
🌱 Demo Seed CLI

Usage: tsx apps/api/seeds/demo/cli.ts <command> [options]

Commands:
  apply     Create demo data
  reverse   Delete demo data  
  reset     Delete then create demo data
  status    Show current demo data status
  help      Show this help

Filters:
  --country US,NG              Filter by country codes
  --type business,individual   Filter by company types  
  --company bizDemoUS          Filter by company IDs or shortCodes

Options:
  --steps users,companies      Only run specific steps
  --parallel                   Run steps in parallel (dangerous!)
  --dry-run                    Show what would happen without doing it

Examples:
  tsx apps/api/seeds/demo/cli.ts apply                           # Create all demo data
  tsx apps/api/seeds/demo/cli.ts apply --country US              # Create US demo data only
  tsx apps/api/seeds/demo/cli.ts apply --type business           # Create business demo data only
  tsx apps/api/seeds/demo/cli.ts reverse --company bizDemoUS     # Delete specific company data
  tsx apps/api/seeds/demo/cli.ts reset --country NG --steps users,companies
  tsx apps/api/seeds/demo/cli.ts status                          # Show current state

Available Countries: ${Object.values(COUNTRY_CODES).join(', ')}
Available Types: ${Object.values(COMPANY_TYPES).join(', ')}

Workspace Commands (from project root):
  pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts apply --all
  pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts status
`);
}

// Cleanup function to ensure database connection is properly closed
async function cleanup() {
  try {
    await knexClient.destroy();
  } catch (error) {
    console.warn('Warning: Error during cleanup:', error instanceof Error ? error.message : error);
  }
}

async function main() {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    return;
  }

  const runner = createDemoSeedRunner(knexClient);
  const filters = parseFilters(args);
  const options = parseOptions(args);

  try {
    switch (command) {
      case 'apply':
        await runner.apply(filters, options);
        break;

      case 'reverse':
        await runner.reverse(filters, options);
        break;

      case 'reset':
        await runner.reset(filters, options);
        break;

      case 'status':
        await runner.status();
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log('Run "tsx apps/api/seeds/demo/cli.ts help" for usage information');
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error('❌ Command failed:', error instanceof Error ? error.message : error);
    throw error; // Re-throw to be handled by main catch
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Received SIGINT, cleaning up...');
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n👋 Received SIGTERM, cleaning up...');
  await cleanup();
  process.exit(0);
});

// Handle uncaught errors without preventing cleanup
process.on('unhandledRejection', async (error) => {
  console.error('❌ Unhandled rejection:', error);
  await cleanup();
  process.exit(1);
});

process.on('uncaughtException', async (error) => {
  console.error('❌ Uncaught exception:', error);
  await cleanup();
  process.exit(1);
});

// Main execution with proper cleanup
main()
  .then(async () => {
    await cleanup();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('❌ Fatal error:', error);
    await cleanup();
    process.exit(1);
  });
