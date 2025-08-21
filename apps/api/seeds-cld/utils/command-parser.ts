import type { CLIOptions, CLICommand } from './types.js';

export class CommandParser {
  private args: string[];

  constructor(args: string[] = process.argv.slice(2)) {
    this.args = args;
  }

  parse(): CLIOptions {
    const [command, ...rest] = this.args;

    if (!command || !this.isValidCommand(command)) {
      this.showUsage();
      process.exit(1);
    }

    const options: CLIOptions = {
      command: command as CLICommand,
    };

    // Parse command-specific arguments
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      const nextArg = rest[i + 1];

      switch (arg) {
        case 'all':
          options.target = 'all';
          break;
        case 'country':
          options.target = 'country';
          options.country = this.validateCountry(nextArg);
          i++; // Skip next arg as it's been consumed
          break;
        case 'type':
          options.target = 'type';
          options.companyType = this.validateCompanyType(nextArg);
          i++; // Skip next arg as it's been consumed
          break;
        case 'company':
          options.target = 'company';
          options.company = nextArg;
          i++; // Skip next arg as it's been consumed
          break;
        case '--country':
          options.country = this.validateCountry(nextArg);
          i++;
          break;
        case '--type':
          options.companyType = this.validateCompanyType(nextArg);
          i++;
          break;
        case '--company':
          options.company = nextArg;
          i++;
          break;
        case '--data-type':
          options.dataType = this.validateDataType(nextArg);
          i++;
          break;
        case '--count':
          options.count = parseInt(nextArg, 10);
          if (isNaN(options.count) || options.count <= 0) {
            throw new Error(`Invalid count: ${nextArg}. Must be a positive integer.`);
          }
          i++;
          break;
        case '--months':
          options.months = parseInt(nextArg, 10);
          if (isNaN(options.months) || options.months <= 0) {
            throw new Error(`Invalid months: ${nextArg}. Must be a positive integer.`);
          }
          i++;
          break;
        case '--dry-run':
          options.dryRun = true;
          break;
        case '--verbose':
        case '-v':
          options.verbose = true;
          break;
        case '--parallel':
          options.parallel = true;
          break;
        default:
          // If it's a known company short code, treat as company target
          if (this.isValidCompanyShortCode(arg)) {
            options.target = 'company';
            options.company = arg;
          } else {
            console.warn(`Unknown argument: ${arg}`);
          }
          break;
      }
    }

    // Validate command-specific requirements
    this.validateOptions(options);

    return options;
  }

  private isValidCommand(command: string): command is CLICommand {
    return ['setup', 'add', 'clean', 'status', 'list', 'inspect', 'history'].includes(command);
  }

  private validateCountry(country: string): 'us' | 'ng' {
    const normalized = country?.toLowerCase();
    if (normalized !== 'us' && normalized !== 'ng') {
      throw new Error(`Invalid country: ${country}. Must be 'us' or 'ng'.`);
    }
    return normalized;
  }

  private validateCompanyType(type: string): 'individual' | 'business' | 'accounting_firm' {
    const normalized = type?.toLowerCase();
    if (!['individual', 'business', 'accounting_firm'].includes(normalized)) {
      throw new Error(
        `Invalid company type: ${type}. Must be 'individual', 'business', or 'accounting_firm'.`,
      );
    }
    return normalized as 'individual' | 'business' | 'accounting_firm';
  }

  private validateDataType(
    dataType: string,
  ): 'transactions' | 'contacts' | 'journals' | 'projects' {
    const normalized = dataType?.toLowerCase();
    if (!['transactions', 'contacts', 'journals', 'projects'].includes(normalized)) {
      throw new Error(
        `Invalid data type: ${dataType}. Must be 'transactions', 'contacts', 'journals', or 'projects'.`,
      );
    }
    return normalized as 'transactions' | 'contacts' | 'journals' | 'projects';
  }

  private isValidCompanyShortCode(code: string): boolean {
    // Known company short codes
    const validCodes = [
      'us-individual',
      'us-business',
      'us-firm',
      'ng-individual',
      'ng-business',
      'ng-firm',
    ];
    return validCodes.includes(code);
  }

  private validateOptions(options: CLIOptions): void {
    switch (options.command) {
      case 'setup':
        if (!options.target) {
          throw new Error(
            'Setup command requires a target. Use: all, country <code>, type <type>, or company <shortCode>',
          );
        }
        break;

      case 'add':
        if (!options.dataType) {
          throw new Error(
            'Add command requires --data-type. Options: transactions, contacts, journals, projects',
          );
        }
        if (!options.target && !options.company) {
          throw new Error('Add command requires a target company or filter');
        }
        break;

      case 'clean':
        if (!options.target && !options.country && !options.companyType && !options.company) {
          throw new Error('Clean command requires a target or filter');
        }
        break;

      case 'inspect':
        if (!options.company) {
          throw new Error('Inspect command requires a company short code');
        }
        break;
    }
  }

  showUsage(): void {
    const usage = `
🌱 Accountable Books - Demo Seeding System

USAGE:
  tsx seeds-cld/cli.ts <command> [options]

COMMANDS:
  setup <target>     Setup demo companies
  add <data-type>    Add additional data to existing companies  
  clean [filters]    Remove demo data
  status            Show seeding status
  list              List all demo companies
  inspect <company> Show detailed company information
  history           Show seed execution history

SETUP TARGETS:
  all                           Setup all 6 demo companies
  country <us|ng>              Setup all companies for country
  type <individual|business|accounting_firm>  Setup companies of specific type
  company <shortCode>          Setup specific company

COMPANY SHORT CODES:
  us-individual    "John Smith's Finances"
  us-business      "Smith Tech Solutions LLC" 
  us-firm          "US Demo Accounting Firm"
  ng-individual    "Adebayo's Personal Finance"
  ng-business      "Lagos Digital Solutions Ltd"
  ng-firm          "Nigeria Demo Accounting Firm"

ADD DATA TYPES:
  transactions     Bank transactions
  contacts         Business contacts
  journals         Journal entries
  projects         Projects (business/firm only)

OPTIONS:
  --country <us|ng>            Filter by country
  --type <type>                Filter by company type  
  --company <shortCode>        Target specific company
  --count <number>             Number of items to generate
  --months <number>            Months of historical data
  --dry-run                    Show what would be done
  --verbose, -v                Detailed output
  --parallel                   Run operations in parallel

EXAMPLES:
  # Setup everything
  tsx seeds-cld/cli.ts setup all

  # Setup US companies only
  tsx seeds-cld/cli.ts setup country us

  # Setup all individual companies  
  tsx seeds-cld/cli.ts setup type individual

  # Setup specific company
  tsx seeds-cld/cli.ts setup company us-business

  # Add transactions to specific company
  tsx seeds-cld/cli.ts add transactions --company ng-business --count 100

  # Add contacts to all business companies
  tsx seeds-cld/cli.ts add contacts --type business --count 25

  # Clean all demo data
  tsx seeds-cld/cli.ts clean all

  # Clean US companies (dry run)
  tsx seeds-cld/cli.ts clean --country us --dry-run

  # Show status
  tsx seeds-cld/cli.ts status

  # Inspect company details
  tsx seeds-cld/cli.ts inspect us-individual
`;

    console.log(usage);
  }
}

// Helper function for easy CLI parsing
export function parseCliArgs(args?: string[]): CLIOptions {
  const parser = new CommandParser(args);
  return parser.parse();
}
