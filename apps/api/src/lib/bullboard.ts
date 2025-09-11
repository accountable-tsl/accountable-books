import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue } from '../jobs/queues/email.queue.js';
import { transactionSyncQueue } from '../jobs/queues/transaction-sync.queue.js';
import { partitionMaintenanceQueue } from '../jobs/queues/partition-maintenance.queue.js';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

// Initialize with all available queues
const queues = [
  new BullMQAdapter(emailQueue),
  new BullMQAdapter(transactionSyncQueue),
  new BullMQAdapter(partitionMaintenanceQueue),
];

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues,
  serverAdapter,
});

export { addQueue, removeQueue, setQueues, replaceQueues, serverAdapter };
