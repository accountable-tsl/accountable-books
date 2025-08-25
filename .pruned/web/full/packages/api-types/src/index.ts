// Generated OpenAPI types and API client
// This file provides a convenient single import for all API-related exports

// Zod schemas for runtime validation
export { schemas as zodSchemas } from './generated/zod-client.js';

// API client for making requests
export { api as apiClient, createApiClient } from './generated/zod-client.js';

// TypeScript types for compile-time safety
export * as HttpContracts from './generated/openapi-paths.js';
export type { Schemas as SchemaTypes } from './generated/schema-types.js';

export * as customZodSchemas from './custom/zod/schema.js';
