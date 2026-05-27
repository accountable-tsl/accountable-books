#!/usr/bin/env tsx

/**
 * Validates that all required secrets are set in Fly.io before deployment
 *
 * This script uses the API_ENV_SCHEMA as the single source of truth to determine
 * which environment variables should be set as secrets in Fly.io.
 *
 * In our setup, ALL environment variables are stored as Fly secrets for security.
 * Variables are required by default unless explicitly marked as required: false.
 *
 * Usage:
 *   pnpm fly:secrets:validate           # Check staging
 *   pnpm fly:secrets:validate:prod      # Check production
 *   tsx scripts/validate-fly-secrets.ts staging
 *   tsx scripts/validate-fly-secrets.ts production
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  Environment,
  EnvSchema,
  EnvVariableConfig,
} from '@accountable-books/utils/env';

import { API_ENV_SCHEMA } from '../config/env-schema.js';

const execAsync = promisify(exec);

interface ValidationResult {
  found: string[];
  missingRequired: string[];
  missingOptional: string[];
  totalSecrets: number;
}

/**
 * Fetch current secrets from Fly.io
 */
async function getFlySecrets(appName: string): Promise<Set<string>> {
  try {
    const { stdout } = await execAsync(`fly secrets list -a ${appName}`);
    const lines = stdout.split('\n');
    const secrets = new Set<string>();

    // Parse the fly secrets list output (tab-delimited format)
    for (const line of lines) {
      if (line.includes('\t') && !line.startsWith('NAME')) {
        const secretName = line.split('\t')[0]?.trim();
        if (secretName) {
          secrets.add(secretName);
        }
      }
    }

    return secrets;
  } catch (error) {
    throw new Error(
      `Failed to fetch secrets from Fly.io app "${appName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Determine if a variable should be required in Fly.io for the given environment
 */
function isRequiredInFly(
  key: string,
  config: EnvVariableConfig,
  environment: Environment,
): boolean {
  // Explicitly marked as not required
  if (config.required === false) {
    return false;
  }

  // NODE_ENV is auto-set by Fly.io environment, don't require it as a secret
  if (key === 'NODE_ENV') {
    return false;
  }

  // Variables are required by default (required !== false)
  return true;
}

/**
 * Get the expected value for a variable in the given environment
 * This helps generate better error messages and suggestions
 */
function getExpectedValue(
  key: string,
  config: EnvVariableConfig,
  environment: Environment,
): string {
  // For NODE_ENV, return the environment name
  if (key === 'NODE_ENV') {
    return environment;
  }

  // Use environment-specific value if available
  if (config[environment]) {
    return config[environment]!;
  }

  // Use default value if specified
  if (config.default !== undefined) {
    return config.default;
  }

  // For secrets, suggest placeholder
  if (config.type === 'secret') {
    return 'your_secret_value_here';
  }

  // For other types, suggest placeholder
  return `your_${key.toLowerCase()}_value`;
}

/**
 * Validate Fly.io secrets against the API schema
 */
async function validateFlySecrets(
  environment: Environment,
): Promise<ValidationResult> {
  const appName = `accountable-books-api-${environment}`;

  console.log(
    `🔍 Validating Fly.io secrets for ${environment} (${appName})...`,
  );
  console.log('');

  // Fetch current secrets from Fly.io
  const existingSecrets = await getFlySecrets(appName);

  // Analyze schema to determine what should be set
  const found: string[] = [];
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  for (const [key, config] of Object.entries(API_ENV_SCHEMA)) {
    const isRequired = isRequiredInFly(key, config, environment);

    if (existingSecrets.has(key)) {
      found.push(key);
    } else {
      if (isRequired) {
        missingRequired.push(key);
      } else {
        missingOptional.push(key);
      }
    }
  }

  return {
    found,
    missingRequired,
    missingOptional,
    totalSecrets: existingSecrets.size,
  };
}

/**
 * Generate fly secrets set command for missing required secrets
 */
function generateSecretsCommand(
  missingRequired: string[],
  environment: Environment,
  appName: string,
): string {
  const secretPairs = missingRequired.map((key) => {
    const config = API_ENV_SCHEMA[key];
    const expectedValue = getExpectedValue(key, config, environment);
    return `${key}="${expectedValue}"`;
  });

  return `fly secrets set \\\n  ${secretPairs.join(' \\\n  ')} \\\n  -a ${appName}`;
}

/**
 * Main validation function
 */
async function main(): Promise<void> {
  const environment = (process.argv[2] || 'staging') as Environment;

  if (!['staging', 'production'].includes(environment)) {
    console.error('❌ Environment must be "staging" or "production"');
    console.error(
      'Usage: tsx scripts/validate-fly-secrets.ts [staging|production]',
    );
    process.exit(1);
  }

  const appName = `accountable-books-api-${environment}`;

  try {
    const result = await validateFlySecrets(environment);

    // Report findings
    console.log(`✅ Found ${result.found.length} secrets set correctly:`);
    if (result.found.length > 0) {
      result.found.slice(0, 5).forEach((name) => console.log(`   ✓ ${name}`));
      if (result.found.length > 5) {
        console.log(`   ... and ${result.found.length - 5} more`);
      }
    }
    console.log('');

    // Report missing optional secrets
    if (result.missingOptional.length > 0) {
      console.log(
        `⚠️  Missing ${result.missingOptional.length} optional secrets:`,
      );
      result.missingOptional.forEach((name) =>
        console.log(`   ○ ${name} (required: false)`),
      );
      console.log('');
    }

    // Report missing required secrets
    if (result.missingRequired.length > 0) {
      console.log(
        `❌ Missing ${result.missingRequired.length} required secrets:`,
      );
      result.missingRequired.forEach((name) => console.log(`   ✗ ${name}`));
      console.log('');

      console.log('💡 To set missing required secrets, run:');
      console.log(
        generateSecretsCommand(result.missingRequired, environment, appName),
      );
      console.log('');

      console.log(
        '🔧 Replace placeholder values with actual secrets before running the command.',
      );

      process.exit(1);
    } else {
      console.log(`🎉 All required secrets are set for ${environment}!`);

      if (result.missingOptional.length > 0) {
        console.log(
          `ℹ️  ${result.missingOptional.length} optional secrets could be set if needed.`,
        );
      }

      console.log(`📊 Total: ${result.totalSecrets} secrets in Fly.io`);
    }
  } catch (error) {
    console.error(
      `❌ Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );

    if (
      error instanceof Error &&
      error.message.includes('fly command not found')
    ) {
      console.error(
        '💡 Make sure the Fly CLI is installed: https://fly.io/docs/getting-started/installing-flyctl/',
      );
    }

    if (error instanceof Error && error.message.includes('not authenticated')) {
      console.error('💡 Run "fly auth login" to authenticate with Fly.io');
    }

    process.exit(1);
  }
}

// Run the validation
main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
