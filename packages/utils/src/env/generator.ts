/**
 * Environment File Generator
 *
 * Generates environment files from centralized schema configuration.
 * Supports smart value resolution, validation, and selective file generation.
 */

import * as crypto from 'crypto';
import type { Environment, EnvSchema, EnvVariableConfig } from './types.js';

/**
 * Generate a secure random secret for the given environment
 */
function generateSecret(key: string, environment: Environment, minLength = 32): string {
  const prefix = `${environment}-${key.toLowerCase().replace(/_/g, '-')}`;
  const randomSuffix = crypto.randomBytes(16).toString('hex');
  const secret = `${prefix}-${randomSuffix}`;

  // Ensure minimum length requirement
  if (secret.length < minLength) {
    const additionalLength = minLength - secret.length;
    const additional = crypto
      .randomBytes(Math.ceil(additionalLength / 2))
      .toString('hex')
      .slice(0, additionalLength);
    return secret + additional;
  }

  return secret;
}

/**
 * Resolve the value for a variable in a specific environment
 */
export function resolveValue(
  key: string,
  config: EnvVariableConfig,
  environment: Environment,
): string {
  // 1. Explicit environment value has highest priority
  if (config[environment]) {
    return config[environment]!;
  }

  // 2. Use default value if specified
  if (config.default !== undefined) {
    return config.default;
  }

  // 3. Auto-generate based on type
  if (config.type === 'secret') {
    return generateSecret(key, environment, config.minLength);
  }

  // 4. Handle NODE_ENV specially
  if (key === 'NODE_ENV') {
    return environment;
  }

  // 5. Optional variables default to empty string
  if (config.required === false) {
    return '';
  }

  // 6. Required variables without values should throw an error
  throw new Error(
    `No value specified for required variable: ${key} in environment: ${environment}`,
  );
}

/**
 * Validate a resolved value against its configuration
 */
export function validateValue(key: string, value: string, config: EnvVariableConfig): boolean {
  // Check minimum length for secrets
  if (config.type === 'secret' && config.minLength && value.length < config.minLength) {
    throw new Error(`${key} must be at least ${config.minLength} characters long`);
  }

  // Check custom validation
  if (config.validation && !config.validation(value)) {
    throw new Error(`${key} failed custom validation`);
  }

  // Basic type validation
  switch (config.type) {
    case 'number':
      if (isNaN(Number(value))) {
        throw new Error(`${key} must be a valid number`);
      }
      break;
    case 'boolean':
      if (!['true', 'false'].includes(value.toLowerCase())) {
        throw new Error(`${key} must be 'true' or 'false'`);
      }
      break;
    case 'url':
      // Skip URL validation for empty optional values
      if (!value && !config.required) {
        break;
      }
      try {
        new URL(value);
      } catch {
        throw new Error(`${key} must be a valid URL`);
      }
      break;
  }

  return true;
}

/**
 * Generate environment file content from schema
 */
export function generateEnvFile(
  schema: EnvSchema,
  environment: Environment,
  fileType: 'main' | 'secrets' | 'example' = 'main',
  includeComments = true,
): string {
  const lines: string[] = [];

  // Add header comment
  if (includeComments) {
    const title = fileType === 'secrets' ? 'Secrets Configuration' : 'Environment Configuration';
    lines.push(`# =============================================================================`);
    lines.push(`# ${title} - ${environment.toUpperCase()}`);
    lines.push(`# =============================================================================`);
    if (fileType === 'secrets') {
      lines.push(`# Fill in the actual secret values for ${environment} deployment`);
      lines.push(`# This file should NEVER be committed to version control`);
    } else {
      lines.push(`# Auto-generated from environment schema. Do not edit manually.`);
      lines.push(`# Run 'pnpm run generate-env' to regenerate this file.`);
    }
    lines.push(``);
  }

  // Process each variable based on file type
  for (const [key, config] of Object.entries(schema)) {
    const isSecret = config.type === 'secret';

    // Determine if we should include this variable
    let shouldInclude = false;
    let useBlankValue = false;

    if (fileType === 'secrets') {
      // Secrets file: only include secrets
      shouldInclude = isSecret;
      useBlankValue = environment === 'staging' || environment === 'production';
    } else if (fileType === 'example') {
      // Example file: include all with placeholders for secrets
      shouldInclude = true;
      useBlankValue = isSecret;
    } else {
      // Main file: exclude secrets for staging/production, include everything for local
      shouldInclude = !isSecret || environment === 'local';
    }

    if (!shouldInclude) continue;

    try {
      let value: string;

      if (useBlankValue) {
        if (fileType === 'example') {
          value = `your_${key.toLowerCase()}_here`;
        } else {
          value = ''; // Blank for staging/production secrets
        }
      } else {
        value = resolveValue(key, config, environment);
        validateValue(key, value, config);
      }

      if (includeComments) {
        lines.push(`# ${config.description}`);
      }

      lines.push(`${key}=${value}`);

      if (includeComments) {
        lines.push('');
      }
    } catch (error) {
      throw new Error(
        `Error generating value for ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  return lines.join('\n');
}

/**
 * Generate specified environment files for a package using target environments
 */
export function generateEnvFiles(
  schema: EnvSchema,
  targetEnvironments: Environment[] = ['local'],
  options: {
    blankStagingSecrets?: boolean;
    blankProductionSecrets?: boolean;
  } = {},
): Record<string, string> {
  const { blankStagingSecrets = true, blankProductionSecrets = true } = options;
  const files: Record<string, string> = {};

  // Always generate example file
  files['.env.example'] = generateEnvFile(schema, 'local', 'example', true);

  // Generate files for each target environment
  for (const env of targetEnvironments) {
    // Generate main env file
    const envFileName = env === 'local' ? '.env.local' : `.env.${env}`;
    files[envFileName] = generateEnvFile(schema, env, 'main', true);

    // Generate separate secrets file for staging/production based on flags
    if (env === 'staging' || env === 'production') {
      const shouldGenerate =
        (env === 'staging' && blankStagingSecrets) ||
        (env === 'production' && blankProductionSecrets);

      if (shouldGenerate) {
        const secretsFileName = `.env.secrets.${env}`;
        files[secretsFileName] = generateEnvFile(schema, env, 'secrets', true);
      }
    }
  }

  return files;
}

/**
 * Parse an .env file and return key-value pairs
 */
function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};

  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      vars[key.trim()] = valueParts.join('=').trim();
    }
  });

  return vars;
}

/**
 * Validate existing environment files against schema
 */
export function validateEnvFiles(
  schema: EnvSchema,
  environment: Environment,
  envFileContent?: string,
  secretsFileContent?: string,
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // If no content provided, we can't validate
  if (!envFileContent) {
    errors.push(`Environment file content not provided for ${environment}`);
    return { isValid: false, errors };
  }

  const envVars = parseEnvFile(envFileContent);
  const secretVars = secretsFileContent ? parseEnvFile(secretsFileContent) : {};

  // Combine both files for validation
  const allVars = { ...envVars, ...secretVars };

  // Check required variables
  for (const [key, config] of Object.entries(schema)) {
    if (config.required !== false) {
      // default is required
      if (!allVars[key]) {
        errors.push(`Missing required environment variable: ${key}`);
        continue;
      }

      try {
        validateValue(key, allVars[key], config);
      } catch (error) {
        errors.push(
          `Invalid value for ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
