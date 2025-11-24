import type { Knex } from 'knex';
import { knexClient } from '../../../db/knexClient.js';
import type {
  CandidateEntryType,
  CandidateSplitType,
  CandidateStatus,
} from './candidates.types.js';

const CANDIDATES_TABLE = 'categorization_candidates';
const CANDIDATE_LINES_TABLE = 'categorization_candidate_lines';

export interface CandidateLineDraft {
  lineRank: number;
  entryType: CandidateEntryType;
  coaId: string;
  projectId?: string | null;
  amountNative: number;
  amountReporting?: number | null;
  currencyCode: string;
  description?: string | null;
  splitType: CandidateSplitType;
  splitValue?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface CreateCandidateParams {
  predictionId: string;
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

  async createCandidateWithLines(
    params: CreateCandidateParams,
  ): Promise<string> {
    return await this.knex.transaction(async (trx) => {
      const [candidate] = await trx(CANDIDATES_TABLE)
        .insert({
          prediction_id: params.predictionId,
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
        await trx(CANDIDATE_LINES_TABLE).insert(rows);
      }

      return candidate.id;
    });
  }
}
