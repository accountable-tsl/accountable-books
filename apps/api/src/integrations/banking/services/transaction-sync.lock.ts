import { redis as redisClient } from '../../../lib/redis.js';
import { logger } from '../../../shared/utils/logger.js';
import { BANK_ACCOUNT_SYNC_LOCK_TTL_SECONDS } from '../transaction-sync.constants.js';
import { syncErrorMessage } from './transaction-sync.errors.js';

function lockKey(bankAccountId: string): string {
  return `sync:transaction:account:${bankAccountId}`;
}

export async function acquireAccountTransactionSyncLock(
  bankAccountId: string,
  ownerId: string,
): Promise<boolean> {
  const key = lockKey(bankAccountId);
  try {
    return (
      (await redisClient.set(
        key,
        ownerId,
        'EX',
        BANK_ACCOUNT_SYNC_LOCK_TTL_SECONDS,
        'NX',
      )) === 'OK'
    );
  } catch (error) {
    logger.error(
      { lockKey: key, ownerId, error: syncErrorMessage(error) },
      'Failed to acquire bank account sync lock',
    );
    throw error;
  }
}

export async function releaseAccountTransactionSyncLock(
  bankAccountId: string,
  ownerId: string,
): Promise<void> {
  const key = lockKey(bankAccountId);
  try {
    await redisClient.eval(
      `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        end
        return 0
      `,
      1,
      key,
      ownerId,
    );
  } catch (error) {
    logger.error(
      { lockKey: key, ownerId, error: syncErrorMessage(error) },
      'Failed to release bank account sync lock',
    );
  }
}
