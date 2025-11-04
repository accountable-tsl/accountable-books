import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { partitionMaintenanceQueue } from '../jobs/queues/partition-maintenance.queue.js';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { emailQueue } from '../features/communications/email/index.js';
import { transactionSyncQueue } from '../integrations/banking/index.js';
import { balanceRecalcQueue } from '../domains/balances/index.js';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

// Initialize with all available queues
const queues = [
  new BullMQAdapter(emailQueue),
  new BullMQAdapter(transactionSyncQueue),
  new BullMQAdapter(partitionMaintenanceQueue),
  new BullMQAdapter(balanceRecalcQueue),
];

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues,
  serverAdapter,
});

export { addQueue, removeQueue, setQueues, replaceQueues, serverAdapter };
