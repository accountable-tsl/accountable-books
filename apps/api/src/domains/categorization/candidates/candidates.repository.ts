import type { Knex } from 'knex';
import { knexClient } from '../../../db/knexClient.js';
import type {
  CandidateSplitType,
  CandidateStatus,
} from './candidates.types.js';
import type { DebitCredit } from '../../../core/index.js';

const CANDIDATES_TABLE = 'categorization_candidates';
const CANDIDATE_LINES_TABLE = 'categorization_candidate_lines';

export interface CandidateLineDraft {
  entryType: DebitCredit;
  coaId: string;
  projectId?: string | null;
  amountNative: number;
  amountReporting?: number | null;
  currencyCode: string;
  description?: string | null;
  isBankLeg?: boolean;
  splitType: CandidateSplitType;
  splitValue?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface CreateCandidateParams {
  predictionId: string;
  source: 'rule' | 'ml';
  categorizationTaskId: string;
  bankTransactionId: string;
  bankTransactionDate: string;
  companyId: string;
  status: CandidateStatus;
  postingDate?: string | null;
  confidence: number;
  contactId?: string | null;
  description?: string | null;
  reference?: string | null;
  solverNotes?: string | null;
  assigneeId?: string | null;
  metadata?: Record<string, unknown> | null;
  lines: CandidateLineDraft[];
}

export class CandidateRepository {
  constructor(private readonly knex: Knex = knexClient) {}

  async softDeleteByTask(params: {
    categorizationTaskId: string;
  }): Promise<number> {
    return await this.knex(CANDIDATES_TABLE)
      .where({
        categorization_task_id: params.categorizationTaskId,
        is_deleted: false,
      })
      .update({
        is_deleted: true,
        updated_at: this.knex.fn.now(),
      });
  }

  async softDeleteByIds(ids: string[]): Promise<number> {
    if (!ids.length) {
      return 0;
    }
    return await this.knex(CANDIDATES_TABLE)
      .whereIn('id', ids)
      .andWhere({ is_deleted: false })
      .update({
        is_deleted: true,
        updated_at: this.knex.fn.now(),
      });
  }

  async findActiveByTask(params: {
    categorizationTaskId: string;
  }): Promise<
    Array<{ id: string; status: CandidateStatus; source: 'rule' | 'ml' }>
  > {
    return await this.knex(CANDIDATES_TABLE)
      .where({
        categorization_task_id: params.categorizationTaskId,
        is_deleted: false,
      })
      .select('id', 'status', 'source');
  }

  async createCandidateWithLines(
    params: CreateCandidateParams,
  ): Promise<string> {
    return await this.knex.transaction(async (trx) => {
      const [candidate] = await trx(CANDIDATES_TABLE)
        .insert({
          prediction_id: params.predictionId,
          source: params.source,
          categorization_task_id: params.categorizationTaskId,
          bank_transaction_id: params.bankTransactionId,
          bank_transaction_date: params.bankTransactionDate,
          company_id: params.companyId,
          status: params.status,
          posting_date: params.postingDate ?? null,
          confidence: params.confidence,
          contact_id: params.contactId ?? null,
          description: params.description ?? null,
          reference: params.reference ?? null,
          solver_notes: params.solverNotes ?? null,
          assignee_id: params.assigneeId ?? null,
          metadata: params.metadata ?? null,
        })
        .returning(['id']);

      if (params.lines.length) {
        const rows = params.lines.map((line) => ({
          candidate_id: candidate.id,
          entry_type: line.entryType,
          coa_id: line.coaId,
          project_id: line.projectId ?? null,
          amount_native: line.amountNative,
          amount_reporting: line.amountReporting ?? null,
          currency_code: line.currencyCode,
          description: line.description ?? null,
          is_bank_leg: line.isBankLeg ?? false,
          split_type: line.splitType,
          split_value: line.splitValue ?? null,
          metadata: line.metadata ?? null,
        }));
        await trx(CANDIDATE_LINES_TABLE).insert(rows);
      }

      return candidate.id;
    });
  }
}
