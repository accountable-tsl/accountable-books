import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { getConditionBlockTargets } from '../task-condition-map.js';
import { evaluateForClient } from '../task-evaluation.service.js';

import type { EvaluateContext } from '../task-evaluation.service.js';

describe('task-evaluation', () => {
  let trx: Knex.Transaction;
  let testUserId: string;
  let testCurrencyId: string;

  let firmCompanyId: string;
  let clientCompanyId: string;
  let bankAccountId: string;

  beforeEach(async () => {
    const db = getTestDb();
    trx = await db.transaction();

    testUserId = await getTestUserId(trx, US_USER_EMAIL);
    testCurrencyId = await getCurrencyId(trx, 'USD');
    const country = await trx('countries').where('code', 'US').first();
    if (!country) throw new Error('US country not found');

    // Firm company
    const [firm] = await trx('companies')
      .insert({
        short_code: `f${randomUUID().slice(0, 8)}`,
        legal_name: 'Test Firm',
        display_name: 'Test Firm',
        type: 'accounting_firm',
        country_id: country.id,
        reporting_currency_id: testCurrencyId,
        year_end_day: 31,
        year_end_month: 12,
        accounting_basis: 'modified_accrual_basis',
        created_by_id: testUserId,
      })
      .returning('*');
    firmCompanyId = firm.id;

    // Client company
    const [client] = await trx('companies')
      .insert({
        short_code: `c${randomUUID().slice(0, 8)}`,
        legal_name: 'Test Client Co',
        display_name: 'Test Client',
        type: 'business',
        country_id: country.id,
        reporting_currency_id: testCurrencyId,
        year_end_day: 31,
        year_end_month: 12,
        accounting_basis: 'modified_accrual_basis',
        created_by_id: testUserId,
      })
      .returning('*');
    clientCompanyId = client.id;

    // COA + bank account for client
    const accountTypeBank = await trx('account_types')
      .where('key', 'ca_bank')
      .first();
    if (!accountTypeBank) throw new Error('account_types.ca_bank not found');

    const [coa] = await trx('coa')
      .insert({
        company_id: clientCompanyId,
        account_type_id: accountTypeBank.id,
        currency_id: testCurrencyId,
        name: 'Cash',
        code: '1000',
        created_by_id: testUserId,
      })
      .returning('*');

    let bank = await trx('banks').where({ key: 'us_chase_bank' }).first();
    if (!bank) {
      [bank] = await trx('banks')
        .insert({
          key: 'us_chase_bank',
          display_name: 'Chase Bank',
          country_code: 'US',
        })
        .returning('*');
    }

    const [ba] = await trx('bank_accounts')
      .insert({
        company_id: clientCompanyId,
        display_name: 'Client checking',
        account_name: 'Client checking',
        account_type: 'checkings_current',
        account_number: `ba-${randomUUID().slice(0, 8)}`,
        business_or_personal: 'business',
        bank_id: bank.id,
        currency_id: testCurrencyId,
        coa_id: coa.id,
        connection_status: 'not_connected',
        created_by_id: testUserId,
        updated_by_id: testUserId,
      })
      .returning('*');
    bankAccountId = ba.id;

    // One fiscal period for client
    await trx('fiscal_calendar').insert({
      company_id: clientCompanyId,
      fiscal_year: 2025,
      period_number: 3,
      period_type: 'monthly',
      start_date: '2025-03-01',
      end_date: '2025-03-31',
      status: 'open',
    });
  });

  afterEach(async () => {
    await trx.rollback();
  });

  function ctx(): EvaluateContext {
    return { firmCompanyId, clientCompanyId, domainArea: 'bookkeeping' };
  }

  describe('task-condition-map', () => {
    it('returns expected task types for uncategorized_transactions', () => {
      const targets = getConditionBlockTargets('uncategorized_transactions');
      expect(targets).toHaveLength(2);
      expect(targets).toContainEqual({
        taskType: 'prepare_period_for_review',
        severity: 'warning',
      });
      expect(targets).toContainEqual({
        taskType: 'close_period',
        severity: 'warning',
      });
    });

    it('returns expected task types for draft_journals', () => {
      const targets = getConditionBlockTargets('draft_journals');
      expect(targets).toContainEqual({
        taskType: 'prepare_period_for_review',
        severity: 'hard',
      });
    });

    it('returns expected task types for disconnected_bank', () => {
      const targets = getConditionBlockTargets('disconnected_bank');
      expect(targets).toContainEqual({
        taskType: 'categorize_transactions',
        severity: 'hard',
      });
    });

    it('returns empty array for unknown code', () => {
      expect(getConditionBlockTargets('nonexistent')).toEqual([]);
    });
  });

  describe('evaluateForClient', () => {
    it('creates a workflow_run and engagement_tasks for the period', async () => {
      await evaluateForClient(ctx(), trx);

      const runs = await trx('workflow_runs').where({
        client_company_id: clientCompanyId,
        is_deleted: false,
      });
      expect(runs).toHaveLength(1);
      expect(runs[0].domain_area).toBe('bookkeeping');
      expect(runs[0].fiscal_year).toBe(2025);
      expect(runs[0].period_number).toBe(3);

      const tasks = await trx('engagement_tasks').where({
        client_company_id: clientCompanyId,
        is_deleted: false,
      });
      expect(tasks.length).toBeGreaterThan(0);

      const taskTypes = tasks.map((t: { task_type: string }) => t.task_type);
      expect(taskTypes).toContain('categorize_transactions');
      expect(taskTypes).toContain('close_period');
      expect(taskTypes).toContain('respond_to_queries');
    });

    it('is idempotent: second run does not duplicate tasks or workflow runs', async () => {
      await evaluateForClient(ctx(), trx);
      const firstRunTasks = await trx('engagement_tasks').where({
        client_company_id: clientCompanyId,
        is_deleted: false,
      });
      const firstRunRuns = await trx('workflow_runs').where({
        client_company_id: clientCompanyId,
        is_deleted: false,
      });

      await evaluateForClient(ctx(), trx);
      const secondRunTasks = await trx('engagement_tasks').where({
        client_company_id: clientCompanyId,
        is_deleted: false,
      });
      const secondRunRuns = await trx('workflow_runs').where({
        client_company_id: clientCompanyId,
        is_deleted: false,
      });

      expect(secondRunTasks).toHaveLength(firstRunTasks.length);
      expect(secondRunRuns).toHaveLength(firstRunRuns.length);

      const firstIds = firstRunTasks.map((t: { id: string }) => t.id).sort();
      const secondIds = secondRunTasks.map((t: { id: string }) => t.id).sort();
      expect(secondIds).toEqual(firstIds);
    });

    it('creates events for newly created tasks', async () => {
      await evaluateForClient(ctx(), trx);

      const tasks = await trx('engagement_tasks').where({
        client_company_id: clientCompanyId,
        is_deleted: false,
      });
      const taskIds = tasks.map((t: { id: string }) => t.id);

      const events = await trx('engagement_task_events')
        .whereIn('task_id', taskIds)
        .where('event_type', 'created');
      expect(events.length).toBe(tasks.length);
    });

    it('creates upstream_task blockers from dependency graph', async () => {
      await evaluateForClient(ctx(), trx);

      // close_period depends on send_reports (which is pending, not completed)
      const closeTask = await trx('engagement_tasks')
        .where({
          client_company_id: clientCompanyId,
          task_type: 'close_period',
          is_deleted: false,
        })
        .first();
      expect(closeTask).toBeTruthy();

      const blockers = await trx('engagement_task_blockers').where({
        task_id: closeTask.id,
        is_active: true,
      });
      const upstreamCodes = blockers
        .filter(
          (b: { blocker_type: string }) => b.blocker_type === 'upstream_task',
        )
        .map((b: { code: string }) => b.code);

      expect(upstreamCodes).toContain('upstream_send_reports');
    });

    it('updates blocker cache on engagement_tasks', async () => {
      await evaluateForClient(ctx(), trx);

      const closeTask = await trx('engagement_tasks')
        .where({
          client_company_id: clientCompanyId,
          task_type: 'close_period',
          is_deleted: false,
        })
        .first();

      expect(closeTask.is_blocked).toBe(true);
      const summary = closeTask.blocking_summary;
      expect(Array.isArray(summary)).toBe(true);
      expect(summary.length).toBeGreaterThan(0);
    });

    it('auto-resolves categorize_transactions when no uncategorized txns', async () => {
      await evaluateForClient(ctx(), trx);

      const catTask = await trx('engagement_tasks')
        .where({
          client_company_id: clientCompanyId,
          task_type: 'categorize_transactions',
          is_deleted: false,
        })
        .first();

      // No bank transactions at all, so uncategorized count = 0, autoResolve should trigger
      expect(catTask.status).toBe('completed');
      expect(catTask.resolution_type).toBe('auto');
    });
  });
});
