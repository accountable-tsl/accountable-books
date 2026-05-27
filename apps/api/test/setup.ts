import { beforeAll } from 'vitest';

import { queueBroker } from '../src/jobs/queues';

beforeAll(async () => {
  queueBroker.configure({
    disableAll: true,
    logSkipped: false,
  });
});
