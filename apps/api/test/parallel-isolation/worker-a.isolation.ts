import { expect, it, vi } from 'vitest';

import { assertWorkerIsolation } from './assert-worker-isolation.js';

it('runs worker A in its own database', async () => {
  await assertWorkerIsolation('worker-a');
});

it('does not evaluate test database naming in production', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('POSTGRES_DB', 'x'.repeat(49));
  vi.stubEnv('DATABASE_URL', 'postgres://example.invalid/accountable');
  vi.resetModules();

  try {
    await expect(import('../../knexfile.js')).resolves.toBeDefined();
  } finally {
    vi.unstubAllEnvs();
  }
});
