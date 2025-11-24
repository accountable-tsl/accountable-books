import type { Knex } from 'knex';
import { knexClient } from '../../../db/knexClient.js';
import type {
  PredictionEntryType,
  PredictionSource,
  PredictionSplitType,
  PredictionStatus,
} from './predictions.types.js';

const PREDICTIONS_TABLE = 'categorization_predictions';
const PREDICTION_LINES_TABLE = 'categorization_prediction_lines';

export interface PredictionLineDraft {
  lineRank: number;
  entryType: PredictionEntryType;
  coaId: string;
  projectId?: string | null;
  amountNative: number;
  amountReporting?: number | null;
  currencyCode: string;
  description?: string | null;
  splitType: PredictionSplitType;
  splitValue?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface CreatePredictionParams {
  categorizationTaskId: string;
  bankTransactionId: string;
  bankTransactionDate: string;
  companyId: string;
  source: PredictionSource;
  rank: number;
  isPrimary: boolean;
  confidence: number;
  modelVersion?: string | null;
  predictionGroupId?: string | null;
  status: PredictionStatus;
  inputChecksum?: string | null;
  explanation?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  lines: PredictionLineDraft[];
}

export class PredictionRepository {
  constructor(private readonly knex: Knex = knexClient) {}

  async softDeleteByTask(params: {
    categorizationTaskId: string;
    source?: PredictionSource;
  }): Promise<number> {
    const query = this.knex(PREDICTIONS_TABLE)
      .where({
        categorization_task_id: params.categorizationTaskId,
        is_deleted: false,
      })
      .update({
        is_deleted: true,
        updated_at: this.knex.fn.now(),
      });
    if (params.source) {
      query.andWhere('source', params.source);
    }
    return await query;
  }

  async createPredictionWithLines(
    params: CreatePredictionParams,
  ): Promise<string> {
    return await this.knex.transaction(async (trx) => {
      const [prediction] = await trx(PREDICTIONS_TABLE)
        .insert({
          categorization_task_id: params.categorizationTaskId,
          bank_transaction_id: params.bankTransactionId,
          bank_transaction_date: params.bankTransactionDate,
          company_id: params.companyId,
          source: params.source,
          rank: params.rank,
          is_primary: params.isPrimary,
          confidence: params.confidence,
          model_version: params.modelVersion ?? null,
          prediction_group_id: params.predictionGroupId ?? null,
          status: params.status,
          input_checksum: params.inputChecksum ?? null,
          explanation: params.explanation ?? null,
          metadata: params.metadata ?? null,
        })
        .returning(['id']);

      if (params.lines.length) {
        const rows = params.lines.map((line) => ({
          prediction_id: prediction.id,
          line_rank: line.lineRank,
          entry_type: line.entryType,
          coa_id: line.coaId,
          project_id: line.projectId ?? null,
          amount_native: line.amountNative,
          amount_reporting: line.amountReporting ?? null,
          currency_code: line.currencyCode,
          description: line.description ?? null,
          split_type: line.splitType,
          split_value: line.splitValue ?? null,
          metadata: line.metadata ?? null,
        }));
        await trx(PREDICTION_LINES_TABLE).insert(rows);
      }

      return prediction.id;
    });
  }
}
