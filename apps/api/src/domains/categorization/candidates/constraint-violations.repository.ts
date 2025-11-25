import type { Knex } from 'knex';
import { knexClient } from '../../../db/knexClient.js';

const CONSTRAINT_VIOLATIONS_TABLE = 'categorization_constraint_violations';

export interface ConstraintViolationDraft {
  candidateId: string;
  violationType: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  metadata?: Record<string, unknown> | null;
}

export class ConstraintViolationRepository {
  constructor(private readonly knex: Knex = knexClient) {}

  async createMany(violations: ConstraintViolationDraft[]): Promise<void> {
    if (!violations.length) {
      return;
    }
    const rows = violations.map((violation) => ({
      candidate_id: violation.candidateId,
      violation_type: violation.violationType,
      severity: violation.severity,
      message: violation.message,
      resolved: false,
      metadata: violation.metadata ?? null,
    }));

    await this.knex(CONSTRAINT_VIOLATIONS_TABLE).insert(rows);
  }
}
