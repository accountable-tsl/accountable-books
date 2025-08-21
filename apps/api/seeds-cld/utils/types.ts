import type { Knex } from 'knex';

// Enhanced seed context with stronger typing
export interface SeedContext {
  companyId?: string;
  companyShortCode?: string;
  country?: 'US' | 'NG';
  companyType?: 'individual' | 'business' | 'accounting_firm';
  variant?: string;
  dataVolume?: 'minimal' | 'standard' | 'extended';
  [key: string]: any;
}

// Step-based seed definition (best of both worlds)
export interface SeedStep {
  id: StepId;
  name: string;
  version: number;
  description: string;
  dependencies: StepId[];
  up(knex: Knex, ctx: SeedContext, mark: MarkFunction): Promise<void>;
  down?(knex: Knex, ctx: SeedContext): Promise<void>;
}

// Step identifiers
export type StepId =
  | 'companies'
  | 'bank-accounts'
  | 'contacts'
  | 'projects'
  | 'transactions'
  | 'journals';

// Enhanced seed definition (for backward compatibility)
export interface EnhancedSeedDefinition {
  name: string;
  version: number;
  tags: string[];
  country?: 'US' | 'NG' | 'all';
  companyType?: 'individual' | 'business' | 'accounting_firm' | 'all';
  dependencies: string[];
  description: string;
  up(knex: Knex, ctx: SeedContext): Promise<void>;
  down(knex: Knex, ctx: SeedContext): Promise<void>;
}

// Data generator interface for consistent data creation
export interface DataGenerator<T = any> {
  name: string;
  version: string;
  generate(ctx: SeedContext): T | Promise<T>;
  validate?(data: T): boolean;
}

// CLI command types (enhanced)
export type CLICommand =
  | 'apply' // Apply steps to targets
  | 'add' // Add specific step to targets
  | 'purge' // Remove data by filters
  | 'status' // Show status
  | 'list' // List all scenarios/steps
  | 'inspect' // Inspect specific company
  | 'history' // Show execution history
  | 'setup' // Setup initial data
  | 'clean'; // Clean up data

export interface CLIOptions {
  command: CLICommand;
  // Targeting
  all?: boolean;
  country?: 'us' | 'ng';
  companyType?: 'individual' | 'business' | 'accounting_firm';
  company?: string;
  step?: StepId;
  steps?: StepId[];
  // Modifiers
  force?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  parallel?: boolean;
  // Legacy support
  target?: 'all' | 'country' | 'type' | 'company';
  dataType?: 'transactions' | 'contacts' | 'journals' | 'projects';
  count?: number;
  months?: number;
}

// Progress tracking
export interface ProgressUpdate {
  operation: string;
  current: number;
  total: number;
  message?: string;
  error?: string;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

// Seed execution result
export interface SeedExecutionResult {
  success: boolean;
  seedName: string;
  duration: number;
  artifactsCreated: number;
  message?: string;
  error?: Error;
}

// Demo company configuration
export interface DemoCompanyConfig {
  shortCode: string;
  legalName: string;
  country: 'US' | 'NG';
  companyType: 'individual' | 'business' | 'accounting_firm';
  user: {
    email: string;
    firstName: string;
    lastName?: string;
  };
  dataScenarios: string[];
}

// Data scenario configuration
export interface DataScenario {
  name: string;
  description: string;
  dataGenerators: string[];
  volume: {
    transactions?: number;
    contacts?: number;
    projects?: number;
    monthsOfData?: number;
  };
}

// Artifact tracking for cleanup
export interface SeedArtifact {
  id: string;
  runId: string;
  tableName: string;
  primaryKey: Record<string, any>;
  companyId?: string;
  operation: 'insert' | 'update' | 'upsert';
  checksum?: string;
  createdAt: Date;
}

// Enhanced mark function for tracking
export type MarkFunction = (
  table: string,
  pk: Record<string, any>,
  operation?: 'insert' | 'update' | 'upsert',
  row?: any,
) => Promise<void>;

// Validation rules
export interface ValidationRule {
  field: string;
  rule: 'required' | 'email' | 'phone' | 'currency' | 'positive' | 'date';
  message?: string;
}

// Country-specific configuration
export interface CountryConfig {
  code: 'US' | 'NG';
  name: string;
  currency: {
    code: string;
    symbol: string;
    id: string; // UUID from currencies table
  };
  bankingFormats: {
    accountNumber: RegExp;
    routingCode: RegExp;
    routingCodeName: string; // "routing number" vs "sort code"
  };
  localization: {
    businessRegistrationPrefix: string;
    taxIdFormat: RegExp;
    phoneFormat: RegExp;
    addressFormat: string;
  };
}

// Company type specific configuration
export interface CompanyTypeConfig {
  type: 'individual' | 'business' | 'accounting_firm';
  displayName: string;
  defaultScenarios: string[];
  requiredData: string[];
  optionalData: string[];
  businessRules: {
    minBankAccounts: number;
    maxBankAccounts: number;
    typicalTransactionVolume: number;
    commonContactTypes: string[];
    projectsRequired: boolean;
  };
}
