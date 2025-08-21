#!/usr/bin/env tsx
import { knexClient } from '../src/db/knexClient.js';
import { parseCliArgs } from './utils/command-parser.js';
import { ProgressReporter } from './utils/progress-reporter.js';
import { StepBasedSeedRunner } from './utils/step-runner.js';
import { allSteps, getSteps, validateStepDependencies } from './steps/index.js';
import type { CLIOptions, DemoCompanyConfig, ProgressUpdate } from './utils/types.js';

// Demo companies configuration
const DEMO_COMPANIES: DemoCompanyConfig[] = [
  // United States
  {
    shortCode: 'us-individual',
    legalName: "John Smith's Finances",
    country: 'US',
    companyType: 'individual',
    user: { email: 'demo.us.individual@example.com', firstName: 'John', lastName: 'Smith' },
    dataScenarios: ['personal-finance'],
  },
  {
    shortCode: 'us-business',
    legalName: 'Smith Tech Solutions LLC',
    country: 'US',
    companyType: 'business',
    user: { email: 'demo.us.business@example.com', firstName: 'Sarah', lastName: 'Smith' },
    dataScenarios: ['tech-startup'],
  },
  {
    shortCode: 'us-firm',
    legalName: 'US Demo Accounting Firm',
    country: 'US',
    companyType: 'accounting_firm',
    user: { email: 'demo.us.firm@example.com', firstName: 'Michael', lastName: 'Johnson' },
    dataScenarios: ['professional-services'],
  },
  // Nigeria
  {
    shortCode: 'ng-individual',
    legalName: "Adebayo's Personal Finance",
    country: 'NG',
    companyType: 'individual',
    user: { email: 'demo.ng.individual@example.com', firstName: 'Adebayo', lastName: 'Ogundimu' },
    dataScenarios: ['personal-finance'],
  },
  {
    shortCode: 'ng-business',
    legalName: 'Lagos Digital Solutions Ltd',
    country: 'NG',
    companyType: 'business',
    user: { email: 'demo.ng.business@example.com', firstName: 'Kemi', lastName: 'Adebayo' },
    dataScenarios: ['digital-business'],
  },
  {
    shortCode: 'ng-firm',
    legalName: 'Nigeria Demo Accounting Firm',
    country: 'NG',
    companyType: 'accounting_firm',
    user: { email: 'demo.ng.firm@example.com', firstName: 'Chinedu', lastName: 'Okafor' },
    dataScenarios: ['professional-services'],
  },
];

class DemoSeedCLI {
  private reporter: ProgressReporter;

  constructor(verbose: boolean = false) {
    this.reporter = new ProgressReporter(verbose);
  }

  async run(): Promise<void> {
    try {
      const options = parseCliArgs();

      console.log('🌱 Accountable Books - Demo Seeding System');
      console.log('='.repeat(50));

      if (options.verbose) {
        console.log('CLI Options:', JSON.stringify(options, null, 2));
      }

      switch (options.command) {
        case 'apply':
          await this.handleApply(options);
          break;
        case 'add':
          await this.handleAdd(options);
          break;
        case 'purge':
          await this.handlePurge(options);
          break;
        case 'status':
          await this.handleStatus(options);
          break;
        case 'list':
          await this.handleList(options);
          break;
        case 'inspect':
          await this.handleInspect(options);
          break;
        case 'history':
          await this.handleHistory(options);
          break;
        // Legacy support
        case 'setup':
          await this.handleApply({ ...options, command: 'apply', all: true });
          break;
        case 'clean':
          await this.handlePurge({ ...options, command: 'purge' });
          break;
      }

      console.log(`\n✅ Operation completed in ${this.reporter.getTotalElapsed()}`);
    } catch (error) {
      this.reporter.reportError('CLI', error as Error);
      process.exit(1);
    } finally {
      await knexClient.destroy();
    }
  }

  private async handleApply(options: CLIOptions): Promise<void> {
    const companies = this.selectCompanies(options);
    const steps = getSteps(options.steps || options.step ? [options.step!] : undefined);

    // Validate step dependencies
    validateStepDependencies(steps);

    console.log(`\n🎯 Applying ${steps.length} steps to ${companies.length} demo companies:`);
    console.log(`Steps: ${steps.map((s) => s.id).join(' → ')}`);

    companies.forEach((company, index) => {
      console.log(`   ${index + 1}. ${company.legalName} (${company.shortCode})`);
    });

    if (options.dryRun) {
      console.log('\n🔍 DRY RUN - No actual changes made');
      return;
    }

    // Create step runner with progress callback
    const progressCallback = (update: ProgressUpdate) => {
      this.reporter.updateProgress(update.operation, update.current, update.total, update.message);
    };

    const runner = new StepBasedSeedRunner(knexClient, progressCallback);

    try {
      const results = await runner.applySteps(companies, steps, {
        force: options.force || false,
        parallel: options.parallel || false,
      });

      // Report results
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      console.log(`\n📊 Results Summary:`);
      console.log(`   ✅ Successful: ${successful.length}`);
      if (failed.length > 0) {
        console.log(`   ❌ Failed: ${failed.length}`);
        failed.forEach((r) => {
          console.log(`      - ${r.seedName}: ${r.error?.message}`);
        });
      }
    } catch (error) {
      this.reporter.reportError('Apply Steps', error as Error);
      throw error;
    }
  }

  private async handleAdd(options: CLIOptions): Promise<void> {
    const companies = this.selectCompanies(options);

    if (!options.step) {
      throw new Error('Step must be specified for add command. Use --step <step-id>');
    }

    const steps = getSteps([options.step]);

    console.log(`\n📈 Adding ${options.step} to ${companies.length} companies:`);

    companies.forEach((company, index) => {
      console.log(`   ${index + 1}. ${company.legalName} (${company.shortCode})`);
    });

    if (options.dryRun) {
      console.log('\n🔍 DRY RUN - No actual changes made');
      return;
    }

    // Create step runner with progress callback
    const progressCallback = (update: ProgressUpdate) => {
      this.reporter.updateProgress(update.operation, update.current, update.total, update.message);
    };

    const runner = new StepBasedSeedRunner(knexClient, progressCallback);

    try {
      const results = await runner.addStep(companies, steps[0], {
        force: options.force || false,
      });

      // Report results
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      console.log(`\n📊 Results Summary:`);
      console.log(`   ✅ Successful: ${successful.length}`);
      if (failed.length > 0) {
        console.log(`   ❌ Failed: ${failed.length}`);
        failed.forEach((r) => {
          console.log(`      - ${r.seedName}: ${r.error?.message}`);
        });
      }
    } catch (error) {
      this.reporter.reportError('Add Step', error as Error);
      throw error;
    }
  }

  private async handlePurge(options: CLIOptions): Promise<void> {
    const filters: any = {};

    if (options.all) {
      filters.all = true;
      console.log('\n🧹 Purging ALL demo data');
    } else {
      if (options.country) filters.country = options.country.toUpperCase();
      if (options.companyType) filters.companyType = options.companyType;
      if (options.company) filters.company = options.company;
      if (options.step) filters.step = options.step;

      console.log('\n🧹 Purging demo data with filters:');
      Object.entries(filters).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
      });
    }

    if (options.dryRun) {
      console.log('\n🔍 DRY RUN - No actual changes made');
      return;
    }

    console.log('\n⚠️  This will permanently delete demo data. Continue? (y/N)');

    // Simple confirmation for now
    if (!options.force) {
      console.log('Use --force to skip confirmation');
      return;
    }

    const runner = new StepBasedSeedRunner(knexClient);

    try {
      const result = await runner.purgeByFilters(filters);

      console.log('\n📊 Purge Results:');
      console.log(`   🗑️  Records deleted: ${result.recordsDeleted}`);
      console.log(`   📋 Tables affected: ${result.tablesAffected.join(', ')}`);
      console.log(`   🏃 Seed runs deleted: ${result.runsDeleted}`);
    } catch (error) {
      this.reporter.reportError('Purge Data', error as Error);
      throw error;
    }
  }

  private async handleStatus(options: CLIOptions): Promise<void> {
    console.log('\n📊 Demo Companies Status:');
    console.log('-'.repeat(80));

    // TODO: Query actual database status
    for (const company of DEMO_COMPANIES) {
      const status = await this.getCompanyStatus(company.shortCode);
      const statusIcon = status.exists ? '✅' : '❌';
      const dataCount = status.exists ? ` (${status.recordCount} records)` : '';

      console.log(`${statusIcon} ${company.shortCode.padEnd(15)} ${company.legalName}${dataCount}`);
    }
  }

  private async handleList(options: CLIOptions): Promise<void> {
    console.log('\n📋 Available Demo Companies:');
    console.log('-'.repeat(80));

    const companies = options.country
      ? DEMO_COMPANIES.filter((c) => c.country === options.country!.toUpperCase())
      : DEMO_COMPANIES;

    companies.forEach((company, index) => {
      console.log(
        `${(index + 1).toString().padStart(2)}. ${company.shortCode.padEnd(15)} ${company.legalName}`,
      );
      console.log(
        `    Country: ${company.country.padEnd(2)}  Type: ${company.companyType.padEnd(15)}  User: ${company.user.email}`,
      );
      console.log(`    Scenarios: ${company.dataScenarios.join(', ')}`);
      console.log('');
    });

    console.log('\n🔧 Available Steps:');
    console.log('-'.repeat(80));

    allSteps.forEach((step, index) => {
      const deps =
        step.dependencies.length > 0 ? ` (depends: ${step.dependencies.join(', ')})` : '';
      console.log(
        `${(index + 1).toString().padStart(2)}. ${step.id.padEnd(15)} ${step.name}${deps}`,
      );
      console.log(`    ${step.description}`);
      console.log('');
    });
  }

  private async handleInspect(options: CLIOptions): Promise<void> {
    const company = DEMO_COMPANIES.find((c) => c.shortCode === options.company);

    if (!company) {
      throw new Error(`Company not found: ${options.company}`);
    }

    console.log(`\n🔍 Inspecting: ${company.legalName} (${company.shortCode})`);
    console.log('='.repeat(60));

    // TODO: Query actual database for detailed information
    console.log(`Country: ${company.country}`);
    console.log(`Type: ${company.companyType}`);
    console.log(
      `User: ${company.user.firstName} ${company.user.lastName || ''} (${company.user.email})`,
    );
    console.log(`Data Scenarios: ${company.dataScenarios.join(', ')}`);

    // Mock data - replace with actual queries
    console.log('\nData Summary:');
    console.log(`  Bank Accounts: 3`);
    console.log(`  Transactions: 150`);
    console.log(`  Contacts: 25`);
    console.log(`  Projects: ${company.companyType === 'individual' ? '0' : '8'}`);
    console.log(`  Journal Entries: 75`);
  }

  private async handleHistory(options: CLIOptions): Promise<void> {
    console.log('\n📜 Seed Execution History:');
    console.log('-'.repeat(80));

    try {
      const history = await knexClient('seed_runs')
        .select('*')
        .where('name', 'like', 'cld:%')
        .orderBy('applied_at', 'desc')
        .limit(20);

      if (history.length === 0) {
        console.log('   No seed history found');
        return;
      }

      history.forEach((run) => {
        const date = new Date(run.applied_at).toLocaleString();
        console.log(`${run.name.padEnd(30)} v${run.version.toString().padStart(2)} ${date}`);
      });
    } catch (error) {
      this.reporter.reportError('History Query', error as Error);
    }
  }

  private selectCompanies(options: CLIOptions): DemoCompanyConfig[] {
    switch (options.target) {
      case 'all':
        return DEMO_COMPANIES;

      case 'country':
        return DEMO_COMPANIES.filter((c) => c.country === options.country!.toUpperCase());

      case 'type':
        return DEMO_COMPANIES.filter((c) => c.companyType === options.companyType);

      case 'company': {
        const company = DEMO_COMPANIES.find((c) => c.shortCode === options.company);
        if (!company) {
          throw new Error(`Company not found: ${options.company}`);
        }
        return [company];
      }

      default: {
        // Handle cases where filters are specified without explicit target
        let companies = DEMO_COMPANIES;

        if (options.country) {
          companies = companies.filter((c) => c.country === options.country!.toUpperCase());
        }

        if (options.companyType) {
          companies = companies.filter((c) => c.companyType === options.companyType);
        }

        if (options.company) {
          companies = companies.filter((c) => c.shortCode === options.company);
        }

        return companies;
      }
    }
  }

  private async getCompanyStatus(
    shortCode: string,
  ): Promise<{ exists: boolean; recordCount: number }> {
    try {
      // Check if company exists
      const company = await knexClient('companies')
        .where('short_code', shortCode)
        .andWhere('is_demo_company', true)
        .first();

      if (!company) {
        return { exists: false, recordCount: 0 };
      }

      // Count related records
      const [bankAccounts, transactions, contacts, projects] = await Promise.all([
        knexClient('bank_accounts').where('company_id', company.id).count('* as count').first(),
        knexClient('bank_transaction_batches')
          .where('company_id', company.id)
          .count('* as count')
          .first(),
        knexClient('contacts').where('company_id', company.id).count('* as count').first(),
        knexClient('projects').where('company_id', company.id).count('* as count').first(),
      ]);

      const totalCount =
        Number(bankAccounts?.count || 0) +
        Number(transactions?.count || 0) +
        Number(contacts?.count || 0) +
        Number(projects?.count || 0);

      return { exists: true, recordCount: totalCount };
    } catch (error) {
      console.warn(`Could not get status for ${shortCode}:`, error);
      return { exists: false, recordCount: 0 };
    }
  }
}

// Main execution
async function main(): Promise<void> {
  const cli = new DemoSeedCLI(process.argv.includes('--verbose') || process.argv.includes('-v'));
  await cli.run();
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ CLI Error:', error);
    process.exit(1);
  });
}
