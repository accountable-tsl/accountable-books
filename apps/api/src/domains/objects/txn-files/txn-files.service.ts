import type {
  GetTxnFileInput,
  NewTxnFile,
  TransactionFiles,
  TxnFileInput,
} from '@accountable-books/contracts/schema';
import {
  getTxnFileInput,
  txnFileInput,
} from '@accountable-books/contracts/schema';
import type { Knex } from 'knex';

import type { ApiResponse } from '../../../core/index.js';
import { knexClient } from '../../../db/knexClient.js';
import {
  errorResponse,
  getCompanyUUID,
  logger,
  successResponse,
} from '../../../shared/utils/index.js';

export async function persistTxnFiles(p: {
  data: TxnFileInput[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}) {
  const { data, companyId, userId, trx } = p;
  const exec = async (txn: Knex.Transaction) => {
    const validationResult = txnFileInput.array().safeParse(data);
    if (!validationResult.success) {
      throw new Error('Invalid inputs - ' + validationResult.error.message);
    }

    const companyUUID = await getCompanyUUID(companyId, txn);
    if (!companyUUID) {
      logger.error({
        companyId,
        message: 'Company not found @ persistTxnFile' + companyId,
      });
      throw new Error('Something went wrong');
    }

    const errors: {}[] = [];
    const fileInput: NewTxnFile[] = validationResult.data.map((file) => {
      if (!file.key.startsWith(`${companyUUID}/`)) {
        errors.push({
          fileKey: file.key,
          companyUUID,
          companyId,
          message: 'Unauthorized: File key does not belong to this company',
        });
      }
      return {
        ...file,
        company_id: companyUUID,
        uploaded_by_id: userId,
      };
    });

    if (errors.length > 0) {
      logger.error({
        companyId,
        companyUUID,
        message: `Unauthorized: ${userId} tried to upload ${errors.length} files that do not belong to this company`,
        errors,
      });
      throw new Error('Unauthorized: Some files not belong to this company');
    }

    const insertedFiles = await txn('transaction_files')
      .insert(fileInput)
      .returning([
        'id',
        'key',
        'name',
        'url',
        'type',
        'bucket_name',
        'size_bytes',
        'transaction_id',
        'entry_id',
      ]);

    return insertedFiles;
  };

  try {
    if (trx) {
      return await exec(trx);
    } else {
      const res = await knexClient.transaction(exec);
      return successResponse('Transaction files persisted successfully', res);
    }
  } catch (error) {
    if (trx) {
      throw error;
    }
    return errorResponse('Failed to persist transaction files', error);
  }
}

type GetTxnFilesParams = {
  data: GetTxnFileInput[];
  trx?: Knex.Transaction;
};

export async function getTxnFiles({
  trx,
  data,
}: GetTxnFilesParams): Promise<ApiResponse<TransactionFiles[]>> {
  const exec = async (txn: Knex.Transaction): Promise<TransactionFiles[]> => {
    const v = getTxnFileInput.array().parse(data);

    const q = txn('transaction_files as tf')
      .join('companies as c', 'c.id', 'tf.company_id')
      .where('tf.is_deleted', false)
      .andWhere((outer) => {
        for (const f of v) {
          outer.orWhere((qb) => {
            // company resolution (per file)
            qb.andWhere((cqb) => {
              cqb
                .where('c.id', f.companyId)
                .orWhere('c.short_code', f.companyId);
            });

            // file identity
            if (f.id) qb.andWhere('tf.id', f.id);
            if (f.source) qb.andWhere('tf.source', f.source);
            if (f.key) qb.andWhere('tf.key', f.key);
            if (f.transactionId)
              qb.andWhere('tf.transaction_id', f.transactionId);
            if (f.entryId) qb.andWhere('tf.entry_id', f.entryId);
          });
        }
      });

    const files = await q.orderBy('created_at', 'desc');
    return files;
  };

  try {
    if (trx) {
      const result = await exec(trx);
      return successResponse('Transaction files fetched successfully', result);
    } else {
      const result = await knexClient.transaction(exec);
      return successResponse('Transaction files fetched successfully', result);
    }
  } catch (e) {
    if (trx) {
      throw e;
    }
    return errorResponse('Failed to fetch transaction files', e);
  }
}
