import { isTest } from '../../config/env.js';
import { getLogger } from '../../shared/utils/logger.js';

const logger = getLogger({ component: 'queue-broker' });

/**
 * Queue names in the system
 * Used for selective disabling and monitoring
 */
export enum QueueName {
  EMAIL = 'email',
  TRANSACTION_SYNC = 'transaction-sync',
  BALANCE_RECALC = 'balance-recalc',
  ENRICHMENT = 'bank-transactions-enrichment',
  RULE_RUNNER = 'rule-runner',
  ML_PREDICTION = 'ml-prediction',
  FISCAL_CALENDAR = 'fiscal-calendar',
  AUTOPOST = 'categorization-autopost',
  JOURNAL_AUTO_REVERSAL = 'journal-auto-reversal',
  RECURRING_JOURNAL = 'recurring-journal-templates',
  TASK_EVALUATION = 'task-evaluation',
  CLOSE_SIGNAL_EVAL = 'close-signal-eval',
  OUTBOX_DISPATCH = 'outbox-dispatch',
}

/**
 * Global queue broker instance
 * Controls all queue operations across the application
 */
class QueueBroker {
  private disableAll = isTest; // Auto-disable in test environment
  private logSkipped = true;

  /**
   * Configure the broker
   */
  configure(config: { disableAll?: boolean; logSkipped?: boolean }): void {
    if (config.disableAll !== undefined) {
      this.disableAll = config.disableAll;
    }
    if (config.logSkipped !== undefined) {
      this.logSkipped = config.logSkipped;
    }
  }

  /**
   * Check if a queue operation should be executed
   */
  shouldExecute(): boolean {
    if (this.disableAll) {
      return false;
    }
    if (process.env.DISABLE_QUEUES === 'true') {
      return false;
    }
    return true;
  }

  /**
   * Wrap an async queue operation
   * Returns the result if enabled, or null if disabled
   */
  async execute<T>(
    queueName: QueueName,
    operation: () => Promise<T>,
  ): Promise<T | null> {
    if (!this.shouldExecute()) {
      if (this.logSkipped) {
        logger.debug({ queueName }, 'Queue operation skipped');
      }
      return null;
    }

    try {
      return await operation();
    } catch (error) {
      logger.error(
        {
          queueName,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Queue operation failed',
      );
      throw error;
    }
  }
}

// Singleton instance
export const queueBroker = new QueueBroker();

/**
 * Helper function to wrap enqueue operations
 * Usage: return executeQueueOperation(QueueName.EMAIL, () => emailQueue.add(...))
 * Returns null if queues are disabled
 * @param queueName - Queue name (for documentation/type safety, not used internally)
 * @param operation - The queue operation to execute
 */
export async function executeQueueOperation<T>(
  queueName: QueueName,
  operation: () => Promise<T>,
): Promise<T | null> {
  return queueBroker.execute(queueName, operation);
}
