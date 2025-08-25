/**
 * Environment Management System - Type Definitions
 *
 * Centralized type definitions for environment variable management
 * across all packages in the monorepo.
 */

/**
 * Supported deployment environments
 */
export type Environment = 'local' | 'staging' | 'production';

/**
 * Environment variable data types with validation support
 */
export type VariableType = 'string' | 'number' | 'boolean' | 'url' | 'secret';

/**
 * Configuration for a single environment variable
 */
interface BaseEnvVariableConfig {
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
 * Type-safe environment variable configuration that prevents
 * production/staging values for secret types
 */
export type EnvVariableConfig =
  | (BaseEnvVariableConfig & {
      type: 'secret';
      // For secrets, production and staging values should not be set in schema
      // They should be provided via separate .env.secrets files
      staging?: never;
      production?: never;
    })
  | (BaseEnvVariableConfig & {
      type: 'string' | 'number' | 'boolean' | 'url';
      staging?: string;
      production?: string;
    });

/**
 * Complete schema for a package's environment variables
 */
export interface EnvSchema {
  [key: string]: EnvVariableConfig;
}
