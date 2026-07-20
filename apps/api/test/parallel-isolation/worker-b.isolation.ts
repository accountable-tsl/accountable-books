import { expect, it } from 'vitest';

import { selectRedisDatabase } from '../../config/redis-url.js';
import { assertWorkerIsolation } from './assert-worker-isolation.js';

it('runs worker B in its own database', async () => {
  await assertWorkerIsolation('worker-b');
});

it('overrides a Redis database encoded in the URL', () => {
  expect(selectRedisDatabase('redis://localhost:6379/0', 2)).toBe(
    'redis://localhost:6379/2',
  );
});
