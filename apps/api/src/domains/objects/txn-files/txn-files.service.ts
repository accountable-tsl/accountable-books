import type {
  GetTxnFileInput,
  TransactionFiles,
  TxnFileInput,
} from '@accountable-books/contracts/schema';
import type { Knex } from 'knex';
import {
  getTxnFileInput,
  txnFileInput,
} from '@accountable-books/contracts/schema';

import { knexClient } from '../../../db/knexClient.js';
import {
  errorResponse,
  getCompanyUUID,
  logger,
  successResponse,
} from '../../../shared/utils/index.js';

import type { ApiResponse } from '../../../core/index.js';

const NULL_UUID = '00000000-0000-0000-0000-000000000000';

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
    const validated = validationResult.data;

    const fileRows = validated.map((file) => {
      if (!file.key.startsWith(`${companyUUID}/`)) {
        errors.push({
          fileKey: file.key,
          companyUUID,
          companyId,
          message: 'Unauthorized: File key does not belong to this company',
        });
      }

      return {
        name: file.name,
        key: file.key,
        bucket_name: file.bucket_name,
        url: file.url,
        mime_type: file.type,
        size_bytes: file.size_bytes,
        checksum: file.checksum ?? null,
        provider: file.provider ?? 'cloudflare_r2',
        region: file.region ?? null,
        endpoint: file.endpoint ?? null,
        company_id: companyUUID,
        uploaded_by_id: userId,
      } as const;
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

    // Upsert files (one blob per company+key)
    const upserted = await txn('files')
      .insert(fileRows)
      .onConflict(['company_id', 'key'])
      .merge({
        name: txn.raw('EXCLUDED.name'),
        bucket_name: txn.raw('EXCLUDED.bucket_name'),
        url: txn.raw('EXCLUDED.url'),
        mime_type: txn.raw('EXCLUDED.mime_type'),
        size_bytes: txn.raw('EXCLUDED.size_bytes'),
        checksum: txn.raw('EXCLUDED.checksum'),
        provider: txn.raw('EXCLUDED.provider'),
        region: txn.raw('EXCLUDED.region'),
        endpoint: txn.raw('EXCLUDED.endpoint'),
        is_deleted: false,
        deleted_at: null,
        deleted_by_id: null,
      })
      .returning<{ id: string; key: string }[]>(['id', 'key']);

    const fileIdByKey = new Map<string, string>();
    for (const row of upserted) {
      fileIdByKey.set(row.key, row.id);
    }

    const attachments = validated.map((f) => {
      const fileId = fileIdByKey.get(f.key);
      if (!fileId) {
        throw new Error(`Failed to resolve file id for key: ${f.key}`);
      }
      return {
        file_id: fileId,
        source: f.source,
        transaction_id: f.transaction_id,
        entry_id: f.entry_id ?? null,
        attached_by_id: userId,
      } as const;
    });

    // Insert attachments (null-safe uniqueness on entry_id via COALESCE).
    const valuesSql = attachments.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const bindings = attachments.flatMap((a) => [
      a.file_id,
      a.source,
      a.transaction_id,
      a.entry_id,
      a.attached_by_id,
    ]);

    await txn.raw(
      `INSERT INTO file_attachments (file_id, source, transaction_id, entry_id, attached_by_id)
       VALUES ${valuesSql}
       ON CONFLICT (file_id, source, transaction_id, COALESCE(entry_id, '${NULL_UUID}'))
       WHERE is_deleted = false
       DO NOTHING`,
      bindings,
    );

    // Return the attachments as TransactionFiles-like rows (backwards compatible)
    const rows = await txn
      .from({ fa: 'file_attachments' })
      .innerJoin({ f: 'files' }, 'f.id', 'fa.file_id')
      .where('fa.is_deleted', false)
      .where('f.is_deleted', false)
      .andWhere((outer) => {
        for (const a of attachments) {
          outer.orWhere((qb) => {
            qb.where('fa.source', a.source)
              .andWhere('fa.transaction_id', a.transaction_id)
              .andWhere('fa.file_id', a.file_id);
            if (a.entry_id) qb.andWhere('fa.entry_id', a.entry_id);
            if (!a.entry_id) qb.whereNull('fa.entry_id');
          });
        }
      })
      .select<TransactionFiles[]>([
        txn.raw(`fa.id as id`),
        txn.raw(`f.name as name`),
        txn.raw(`f.key as key`),
        txn.raw(`f.bucket_name as bucket_name`),
        txn.raw(`f.url as url`),
        txn.raw(`f.mime_type as type`),
        txn.raw(`f.size_bytes as size_bytes`),
        txn.raw(`f.checksum as checksum`),
        txn.raw(`f.provider as provider`),
        txn.raw(`f.region as region`),
        txn.raw(`f.endpoint as endpoint`),
        txn.raw(`fa.source as source`),
        txn.raw(`fa.transaction_id as transaction_id`),
        txn.raw(`fa.entry_id as entry_id`),
        txn.raw(`f.company_id as company_id`),
        txn.raw(`f.uploaded_by_id as uploaded_by_id`),
        txn.raw(`f.uploaded_at as uploaded_at`),
        txn.raw(`fa.is_deleted as is_deleted`),
        txn.raw(`fa.deleted_at as deleted_at`),
        txn.raw(`fa.detached_by_id as deleted_by_id`),
      ])
      .orderBy([
        { column: 'fa.attached_at', order: 'desc' },
        { column: 'fa.id', order: 'desc' },
      ]);

    return rows;
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

export async function syncTxnFilesForTarget(p: {
  companyId: string;
  userId: string;
  source: TxnFileInput['source'];
  transactionId: string;
  entryId?: string | null;
  files: TxnFileInput[];
  mode: 'replace' | 'merge';
  trx?: Knex.Transaction;
}) {
  /**
   * Sync (attach/detach) transaction files for a single target (source + transactionId + entryId).
   *
   * This function operates on the normalized schema:
   * - `files`: one row per uploaded blob (unique per `company_id + key`)
   * - `file_attachments`: links a `file_id` to a specific target (ledger/journal/bank transaction or entry)
   *
   * Behavior:
   * - Always validates that every `files[]` item matches the passed target (`source`, `transactionId`, `entryId`).
   * - If `mode === 'merge'`:
   *   - Only attaches the provided files (idempotent). Existing attachments are left untouched.
   * - If `mode === 'replace'`:
   *   - Soft-deletes attachments currently on the target that are NOT present in the provided `files[]`.
   *   - Then attaches the provided files (idempotent).
   *
   * Important notes:
   * - Detaching here only affects `file_attachments` (soft delete). It never deletes rows from `files`,
   *   since the same underlying blob may be attached to multiple places.
   * - When `files[]` is empty and `mode === 'replace'`, all attachments for the target are detached.
   *
   * Typical usage:
   * - Draft update flows: treat a provided `files` array as the desired final state ⇒ `mode: 'replace'`.
   * - Add-only flows: attach new files without removing existing ⇒ `mode: 'merge'`.
   */
  const {
    companyId,
    userId,
    source,
    transactionId,
    entryId = null,
    files,
    mode,
    trx,
  } = p;

  const exec = async (txn: Knex.Transaction) => {
    const validationResult = txnFileInput.array().safeParse(files);
    if (!validationResult.success) {
      throw new Error('Invalid inputs - ' + validationResult.error.message);
    }

    const validated = validationResult.data;
    for (const f of validated) {
      if (
        f.source !== source ||
        f.transaction_id !== transactionId ||
        (f.entry_id ?? null) !== entryId
      ) {
        throw new Error('Invalid inputs - file target does not match payload');
      }
    }

    const companyUUID = await getCompanyUUID(companyId, txn);
    if (!companyUUID) {
      logger.error({
        companyId,
        message: 'Company not found @ syncTxnFilesForTarget ' + companyId,
      });
      throw new Error('Something went wrong');
    }

    const now = new Date();
    const desiredKeys = [...new Set(validated.map((f) => f.key))];

    if (mode === 'replace') {
      const entryFilterSql = entryId
        ? 'AND fa.entry_id = ?'
        : 'AND fa.entry_id IS NULL';
      const entryBindings = entryId ? [entryId] : [];

      if (desiredKeys.length === 0) {
        await txn.raw(
          `UPDATE file_attachments fa
           SET is_deleted = true,
               deleted_at = ?,
               detached_by_id = ?,
               updated_at = ?
           FROM files f
           WHERE fa.file_id = f.id
             AND f.company_id = ?
             AND fa.source = ?
             AND fa.transaction_id = ?
             ${entryFilterSql}
             AND fa.is_deleted = false`,
          [
            now,
            userId,
            now,
            companyUUID,
            source,
            transactionId,
            ...entryBindings,
          ],
        );
      } else {
        await txn.raw(
          `UPDATE file_attachments fa
           SET is_deleted = true,
               deleted_at = ?,
               detached_by_id = ?,
               updated_at = ?
           FROM files f
           WHERE fa.file_id = f.id
             AND f.company_id = ?
             AND fa.source = ?
             AND fa.transaction_id = ?
             ${entryFilterSql}
             AND fa.is_deleted = false
             AND f.key NOT IN (${desiredKeys.map(() => '?').join(', ')})`,
          [
            now,
            userId,
            now,
            companyUUID,
            source,
            transactionId,
            ...entryBindings,
            ...desiredKeys,
          ],
        );
      }
    }

    if (validated.length === 0) return [];

    // Attach desired files (idempotent) via the existing persist flow.
    const persisted = await persistTxnFiles({
      data: validated,
      companyId,
      userId,
      trx: txn,
    });

    return persisted;
  };

  try {
    if (trx) {
      return await exec(trx);
    }
    const res = await knexClient.transaction(exec);
    return successResponse('Transaction files synced successfully', res);
  } catch (error) {
    if (trx) throw error;
    return errorResponse('Failed to sync transaction files', error);
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

    const q = txn('file_attachments as fa')
      .innerJoin('files as f', 'f.id', 'fa.file_id')
      .join('companies as c', 'c.id', 'f.company_id')
      .where('fa.is_deleted', false)
      .where('f.is_deleted', false)
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
            if (f.id) qb.andWhere('fa.id', f.id);
            if (f.source) qb.andWhere('fa.source', f.source);
            if (f.key) qb.andWhere('f.key', f.key);
            if (f.transactionId)
              qb.andWhere('fa.transaction_id', f.transactionId);
            if (f.entryId) qb.andWhere('fa.entry_id', f.entryId);
          });
        }
      });

    const files = await q
      .select<
        TransactionFiles[]
      >([txn.raw(`fa.id as id`), txn.raw(`f.name as name`), txn.raw(`f.key as key`), txn.raw(`f.bucket_name as bucket_name`), txn.raw(`f.url as url`), txn.raw(`f.mime_type as type`), txn.raw(`f.size_bytes as size_bytes`), txn.raw(`f.checksum as checksum`), txn.raw(`f.provider as provider`), txn.raw(`f.region as region`), txn.raw(`f.endpoint as endpoint`), txn.raw(`fa.source as source`), txn.raw(`fa.transaction_id as transaction_id`), txn.raw(`fa.entry_id as entry_id`), txn.raw(`f.company_id as company_id`), txn.raw(`f.uploaded_by_id as uploaded_by_id`), txn.raw(`f.uploaded_at as uploaded_at`), txn.raw(`fa.is_deleted as is_deleted`), txn.raw(`fa.deleted_at as deleted_at`), txn.raw(`fa.detached_by_id as deleted_by_id`)])
      .orderBy([
        { column: 'fa.attached_at', order: 'desc' },
        { column: 'fa.id', order: 'desc' },
      ]);

    return files as unknown as TransactionFiles[];
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
