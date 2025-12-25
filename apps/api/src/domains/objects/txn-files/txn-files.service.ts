import type { Knex } from 'knex';
import { knexClient } from '../../../db/knexClient.js';
import {
  txnFileInput,
  type NewTxnFile,
  type TxnFileInput,
} from './txn-files.types.js';
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
