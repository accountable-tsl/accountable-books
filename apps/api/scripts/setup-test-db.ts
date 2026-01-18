import '../config/env-loader.js';

import { setupTestDatabase } from '../config/test-db.js';

// Set NODE_ENV to test so migrations know they're running in test mode
process.env.NODE_ENV = 'test';

/**
 * Sets up the test database (creates if needed and runs migrations).
 * Used by the migrate script.
 */
setupTestDatabase()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to setup test database:', error);
    process.exit(1);
  });
