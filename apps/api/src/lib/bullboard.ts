import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { ALL_QUEUES } from '../jobs/registry.js';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

// Initialize with all queues from the registry
const queues = ALL_QUEUES.map((queue) => new BullMQAdapter(queue));

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues,
  serverAdapter,
});

export { addQueue, removeQueue, replaceQueues, serverAdapter, setQueues };
