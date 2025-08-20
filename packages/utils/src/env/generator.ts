/**
 * Environment File Generator
 *
 * Generates environment files from centralized schema configuration.
 * Supports smart value resolution, validation, and selective file generation.
 */

import * as crypto from 'crypto';
import type { Environment, EnvSchema, EnvVariableConfig, GeneratorOptions } from './types.js';

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
export function generateEnvFile(schema: EnvSchema, options: GeneratorOptions): string {
  const { environment, includeSensitive = true, includeComments = true } = options;

  const lines: string[] = [];

  // Add header comment
  if (includeComments) {
    lines.push(`# =============================================================================`);
    lines.push(`# Environment Configuration - ${environment.toUpperCase()}`);
    lines.push(`# =============================================================================`);
    lines.push(`# Auto-generated from environment schema. Do not edit manually.`);
    lines.push(`# Run 'pnpm run generate-env' to regenerate this file.`);
    lines.push(``);
  }

  // Process each variable
  for (const [key, config] of Object.entries(schema)) {
    // Skip sensitive variables for .env.example
    if (!includeSensitive && config.type === 'secret') {
      if (includeComments) {
        lines.push(`# ${config.description}`);
        lines.push(`${key}=your_${key.toLowerCase()}_here`);
        lines.push('');
      }
      continue;
    }

    try {
      const value = resolveValue(key, config, environment);
      validateValue(key, value, config);

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
 * Generate specified environment files for a package
 */
export function generateEnvFiles(
  schema: EnvSchema,
  targetFiles: string[] = ['.env.local', '.env.test', '.env.example'],
): Record<string, string> {
  const files: Record<string, string> = {};

  for (const fileName of targetFiles) {
    if (fileName === '.env.example') {
      // Generate example file without sensitive values
      files[fileName] = generateEnvFile(schema, {
        environment: 'local', // Use local as base for example
        includeSensitive: false,
        includeComments: true,
      });
    } else if (fileName.startsWith('.env.')) {
      // Extract environment from filename
      const env = fileName.replace('.env.', '') as Environment;
      if (['local', 'test', 'staging', 'production'].includes(env)) {
        files[fileName] = generateEnvFile(schema, {
          environment: env,
          includeSensitive: true,
          includeComments: true,
        });
      }
    }
  }

  return files;
}
