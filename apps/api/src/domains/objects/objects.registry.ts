import z from 'zod';
import { ENV } from '../../config/env.js';

export const BUCKET_NAME_MAP = {
  logos: ENV.R2_LOGOS_BUCKET_NAME || 'logos',
  txnFiles: ENV.R2_TRANSACTION_FILES_BUCKET_NAME || 'transaction-files',
} as const;
