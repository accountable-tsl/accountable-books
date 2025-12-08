import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { balanceRecalcQueue } from '../domains/balances/index.js';
import { autopostQueue } from '../domains/categorization/autopost/index.js';
import { emailQueue } from '../features/communications/email/index.js';
import { transactionSyncQueue } from '../integrations/banking/index.js';
import { partitionMaintenanceQueue } from '../jobs/queues/partition-maintenance.queue.js';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

// Initialize with all available queues
const queues = [
  new BullMQAdapter(emailQueue),
  new BullMQAdapter(transactionSyncQueue),
  new BullMQAdapter(partitionMaintenanceQueue),
  new BullMQAdapter(balanceRecalcQueue),
  new BullMQAdapter(autopostQueue),
];

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues,
  serverAdapter,
});

export { addQueue, removeQueue, replaceQueues, serverAdapter, setQueues };
