import { describe, expect, it } from 'vitest';

import {
  CLOSE_READINESS_FINDING_CODES,
  CLOSE_READINESS_RULES,
  CLOSE_READINESS_RULES_BY_CODE,
  closeReadinessEvaluation,
  getCloseReadinessRulesForAccountingBasis,
} from './close-readiness.types.js';

describe('close readiness contract', () => {
  it('defines unique rule codes', () => {
    const uniqueCodes = new Set(CLOSE_READINESS_FINDING_CODES);

    expect(uniqueCodes.size).toBe(CLOSE_READINESS_FINDING_CODES.length);
    expect(CLOSE_READINESS_RULES_BY_CODE.size).toBe(
      CLOSE_READINESS_RULES.length,
    );
  });

  it('does not expose future-only rules as active V1 rules', () => {
    const futureRules = CLOSE_READINESS_RULES.filter(
      (rule) => rule.activation === 'future',
    );

    expect(futureRules.map((rule) => rule.code)).toEqual([
      'subledger_gl_control_mismatch',
    ]);
  });

  it('keeps bank sync staleness out of hard blockers', () => {
    const bankSyncRule = CLOSE_READINESS_RULES_BY_CODE.get(
      'bank_sync_stale_review',
    );

    expect(bankSyncRule?.severity).toBe('required_review');
  });

  it('keeps period-not-ended as a state gate rather than a finding code', () => {
    expect(CLOSE_READINESS_FINDING_CODES).not.toContain(
      'period_not_ended_company_timezone',
    );
  });

  it('filters rules by accounting basis', () => {
    const cashRules = getCloseReadinessRulesForAccountingBasis(
      'modified_cash_basis',
    );
    const accrualRules = getCloseReadinessRulesForAccountingBasis(
      'modified_accrual_basis',
    );

    expect(
      cashRules.some((rule) => rule.code === 'cash_reports_ready_confirmed'),
    ).toBe(true);
    expect(
      cashRules.some((rule) => rule.code === 'accrual_reports_ready_confirmed'),
    ).toBe(false);
    expect(
      accrualRules.some(
        (rule) => rule.code === 'accrual_reports_ready_confirmed',
      ),
    ).toBe(true);
  });

  it('validates the read-only evaluation contract', () => {
    const result = closeReadinessEvaluation.safeParse({
      companyId: '018f0000-0000-7000-8000-000000000001',
      firmCompanyId: null,
      workflowRunId: null,
      accountingBasis: 'modified_cash_basis',
      timezone: 'Europe/London',
      evaluatedAt: '2026-06-15T12:00:00.000Z',
      state: 'preview',
      formalCloseAllowed: false,
      stateGateCodes: ['period_not_ended_company_timezone'],
      surfaces: ['company_workspace'],
      audience: 'owner_managed',
      period: {
        fiscalYear: 2026,
        periodNumber: 6,
        periodType: 'monthly',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        status: 'open',
      },
      findings: [],
      summary: {
        blockerCount: 0,
        requiredReviewCount: 0,
        advisoryCount: 0,
        finalConfirmationCount: 0,
      },
    });

    expect(result.success).toBe(true);
  });
});
