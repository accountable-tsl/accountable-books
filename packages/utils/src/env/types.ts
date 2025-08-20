/**
 * Environment Management System - Type Definitions
 *
 * Centralized type definitions for environment variable management
 * across all packages in the monorepo.
 */

/**
 * Supported deployment environments
 */
export type Environment = 'local' | 'test' | 'staging' | 'production';

/**
 * Environment variable data types with validation support
 */
export type VariableType = 'string' | 'number' | 'boolean' | 'url' | 'secret';

/**
 * Configuration for a single environment variable
 */
export interface EnvVariableConfig {
  /** Human-readable description of the variable */
  description: string;

  /** Data type for validation */
  type: VariableType;

  /** Whether this variable is required */
  required?: boolean;

  /** Default value for all environments (lowest priority) */
  default?: string;

  /** Local development value */
  local?: string;

  /** Test environment value */
  test?: string;

  /** Staging environment value */
  staging?: string;

  /** Production environment value */
  production?: string;

  /** Minimum length for string/secret validation */
  minLength?: number;

  /** Custom validation function */
  validation?: (value: string) => boolean;
}

/**
 * Complete schema for a package's environment variables
 */
export interface EnvSchema {
  [key: string]: EnvVariableConfig;
}

/**
 * Options for environment file generation
 */
export interface GeneratorOptions {
  /** Target environment to generate for */
  environment: Environment;

  /** Whether to include sensitive variables */
  includeSensitive?: boolean;

  /** Whether to include descriptive comments */
  includeComments?: boolean;

  /** Specific files to generate (e.g., ['.env.local', '.env.test']) */
  targetFiles?: string[];
}
