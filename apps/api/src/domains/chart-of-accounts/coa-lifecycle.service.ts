import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { generateChecksumSync } from '../../shared/index.js';
import {
  acquireAdvisoryXactLocks,
  lockKeyCompany,
} from '../../shared/services/advisoryLocks.service.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  AppError,
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import {
  disableCategorizationRulesForCoaResolution,
  replaceCoaInCategorizationRules,
} from '../categorization/rules/coa-reference-resolution.service.js';
import {
  replaceCoaInDraftJournals,
  voidDraftJournalsForCoaResolution,
} from '../journals/coa-reference-resolution.service.js';
import {
  closeRecurringTemplatesForCoaResolution,
  replaceCoaInRecurringTemplates,
} from '../journals/recurring-coa-reference-resolution.service.js';
import { inspectCoaLifecycleImpacts } from './coa-lifecycle-impact.service.js';
import { writeCoaLifecycleExecutedAudit } from './coa-lifecycle.audit.js';
import { archiveCoa, deleteCoa } from './coa.model.js';
import {
  coaLifecycleExecuteInput,
  coaLifecyclePreflightInput,
} from './coa.types.js';

import type {
  CoaLifecycleAccountPreflight,
  CoaLifecycleExecuteInput,
  CoaLifecycleOperation,
  CoaLifecyclePreflightInput,
  CoaLifecyclePreflightResponse,
  CoaLifecycleResolution,
} from './coa.types.js';

export async function preflightCoaLifecycle(input: {
  companyId: string;
  data: CoaLifecyclePreflightInput;
}) {
  const parsed = coaLifecyclePreflightInput.safeParse(input.data);
  if (!parsed.success) {
    return errorResponse('Invalid lifecycle preflight input', parsed.error, {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  try {
    const result = await knexClient.transaction(async (trx) => {
      const companyUUID = await getCompanyUUID(input.companyId, trx);
      await acquireAdvisoryXactLocks(trx, [lockKeyCompany(companyUUID)]);
      return buildLifecyclePreflight({
        trx,
        companyId: companyUUID,
        data: parsed.data,
      });
    });
    return successResponse(
      'Chart of accounts lifecycle preflight completed',
      result,
    );
  } catch (error) {
    return errorResponse(
      'Failed to preflight chart of accounts lifecycle',
      error,
    );
  }
}

export async function executeCoaLifecycle({
  companyId,
  userId,
  data,
}: {
  companyId: string;
  userId: string;
  data: CoaLifecycleExecuteInput;
}) {
  const parsed = coaLifecycleExecuteInput.safeParse(data);
  if (!parsed.success) {
    return errorResponse('Invalid lifecycle execution input', parsed.error, {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  try {
    const result = await knexClient.transaction(async (trx) => {
      const companyUUID = await getCompanyUUID(companyId, trx);
      await acquireAdvisoryXactLocks(trx, [lockKeyCompany(companyUUID)]);

      const before = await buildLifecyclePreflight({
        trx,
        companyId: companyUUID,
        data: parsed.data,
      });
      if (before.impactFingerprint !== parsed.data.impactFingerprint) {
        throw new AppError(
          'Chart of accounts references changed; run preflight again',
          {
            reason: 'stale_impact_fingerprint',
            retryable: true,
            preflight: before,
          },
          false,
          ErrorCode.CONFLICT,
        );
      }

      await applyResolutions({
        trx,
        companyId: companyUUID,
        userId,
        accountIds: parsed.data.accountIds,
        preflight: before,
        resolutions: parsed.data.resolutions ?? [],
      });

      const after = await buildLifecyclePreflight({
        trx,
        companyId: companyUUID,
        data: parsed.data,
      });
      assertLifecycleCanExecute({
        preflight: after,
        acknowledgeUnresolvedArchiveReferences:
          parsed.data.acknowledgeUnresolvedArchiveReferences ?? false,
      });

      const lifecycleResult =
        parsed.data.operation === 'archive'
          ? await archiveCoa({
              trx,
              companyId: companyUUID,
              userId,
              accountIds: parsed.data.accountIds,
            })
          : await deleteCoa({
              trx,
              companyId: companyUUID,
              userId,
              accountIds: parsed.data.accountIds,
            });

      if (!lifecycleResult.success) {
        throw new AppError(
          lifecycleResult.message,
          lifecycleResult.error,
          false,
          (lifecycleResult.code as ErrorCode | undefined) ??
            ErrorCode.OPERATION_NOT_ALLOWED,
        );
      }

      const finalPreflight = await buildLifecyclePreflight({
        trx,
        companyId: companyUUID,
        data: parsed.data,
      });
      const updatedAccountIds = new Set(
        lifecycleResult.data?.updatedAccounts.map((account) => account.id) ??
          [],
      );
      for (const account of finalPreflight.accounts) {
        if (!updatedAccountIds.has(account.id)) continue;
        const accountResolutions = (parsed.data.resolutions ?? []).filter(
          (resolution) => resolution.sourceCoaId === account.id,
        );
        await writeCoaLifecycleExecutedAudit({
          trx,
          companyId: companyUUID,
          entityId: account.id,
          actor: { type: 'user', userId },
          payload: {
            operation: parsed.data.operation,
            impactFingerprint: parsed.data.impactFingerprint,
            resolutions: accountResolutions,
            acknowledgedUnresolvedArchiveReferences:
              parsed.data.acknowledgeUnresolvedArchiveReferences ?? false,
            remainingReferences: {
              draftJournals: account.references.draftJournals.length,
              recurringTemplates: account.references.recurringTemplates.length,
              categorizationRules:
                account.references.categorizationRules.length,
              predictions: account.references.predictions.count,
              candidates: account.references.candidates.count,
            },
            resolvedReferenceTypes: uniqueSorted(
              accountResolutions.map((resolution) => resolution.referenceType),
            ),
          },
        });
      }

      return {
        ...lifecycleResult.data,
        preflight: finalPreflight,
      };
    });

    return successResponse(
      'Chart of accounts lifecycle operation completed',
      result,
    );
  } catch (error) {
    return errorResponse(
      'Failed to execute chart of accounts lifecycle operation',
      error,
    );
  }
}

async function buildLifecyclePreflight({
  trx,
  companyId,
  data,
}: {
  trx: Knex.Transaction;
  companyId: string;
  data: CoaLifecyclePreflightInput;
}): Promise<CoaLifecyclePreflightResponse> {
  const accountIds = uniqueSorted(data.accountIds);
  if (accountIds.length !== data.accountIds.length) {
    throw new AppError(
      'Duplicate account IDs are not allowed',
      undefined,
      false,
      ErrorCode.INVALID_INPUT,
    );
  }

  const accounts = await trx('coa')
    .where({ company_id: companyId })
    .whereIn('id', accountIds)
    .orderBy('id')
    .forUpdate()
    .select<
      {
        id: string;
        name: string;
        locked: boolean;
        is_deleted: boolean;
      }[]
    >('id', 'name', 'locked', 'is_deleted');
  if (accounts.length !== accountIds.length) {
    throw new AppError(
      'One or more chart of accounts were not found',
      undefined,
      false,
      ErrorCode.NOT_FOUND,
    );
  }

  const inspection = await inspectCoaLifecycleImpacts({
    trx,
    companyId,
    coaIds: accountIds,
  });
  const accountPreflights = accounts.map((account) =>
    buildAccountPreflight({
      account,
      operation: data.operation,
      inspection,
    }),
  );
  const fingerprintPayload = {
    operation: data.operation,
    accounts: accountPreflights.map((account) => ({
      id: account.id,
      blockers: [...account.blockers].sort(),
      references: {
        bankAccounts: referenceIds(account.references.bankAccounts),
        ledgerEntries: account.references.ledgerEntries.count,
        draftJournals: referenceIds(account.references.draftJournals),
        recurringTemplates: referenceIds(account.references.recurringTemplates),
        categorizationRules: referenceIds(
          account.references.categorizationRules,
        ),
        predictions: account.references.predictions.count,
        candidates: account.references.candidates.count,
      },
    })),
  };

  return {
    operation: data.operation,
    impactFingerprint: generateChecksumSync(fingerprintPayload),
    accounts: accountPreflights,
    canExecuteWithoutResolution: accountPreflights.every(
      (account) =>
        account.blockers.length === 0 && !hasOperationalReferences(account),
    ),
  };
}

function buildAccountPreflight({
  account,
  operation,
  inspection,
}: {
  account: { id: string; name: string; locked: boolean; is_deleted: boolean };
  operation: CoaLifecycleOperation;
  inspection: Awaited<ReturnType<typeof inspectCoaLifecycleImpacts>>;
}): CoaLifecycleAccountPreflight {
  const impact = inspection.impactsByCoaId.get(account.id);
  const references = inspection.referencesByCoaId.get(account.id);
  if (!impact || !references) {
    throw new Error(`Missing lifecycle inspection for account ${account.id}`);
  }

  const blockers: string[] = [];
  if (account.locked) blockers.push('locked_account');
  if (references.bankAccounts.length > 0) blockers.push('active_bank_account');
  if (operation === 'delete' && references.ledgerEntries > 0) {
    blockers.push('ledger_entries');
  }
  if (
    operation === 'delete' &&
    references.categorizationRules.some((rule) => rule.resolvable === false)
  ) {
    blockers.push('non_company_categorization_rule');
  }

  const availableActions: CoaLifecycleAccountPreflight['availableActions'] = [];
  if (operation === 'archive' && hasReferences(references)) {
    availableActions.push('acknowledge_archive');
  }
  if (references.draftJournals.length > 0) {
    availableActions.push('replace_draft_journals', 'void_draft_journals');
  }
  if (references.recurringTemplates.length > 0) {
    availableActions.push(
      'replace_recurring_templates',
      'close_recurring_templates',
    );
  }
  if (
    references.categorizationRules.some((rule) => rule.resolvable !== false)
  ) {
    availableActions.push(
      'replace_categorization_rules',
      'disable_categorization_rules',
    );
  }

  return {
    id: account.id,
    name: account.name,
    blockers,
    references: {
      bankAccounts: references.bankAccounts,
      ledgerEntries: { count: references.ledgerEntries },
      draftJournals: references.draftJournals,
      recurringTemplates: references.recurringTemplates,
      categorizationRules: references.categorizationRules,
      predictions: { count: impact.predictions },
      candidates: { count: impact.candidates },
    },
    availableActions,
  };
}

async function applyResolutions({
  trx,
  companyId,
  userId,
  accountIds,
  preflight,
  resolutions,
}: {
  trx: Knex.Transaction;
  companyId: string;
  userId: string;
  accountIds: string[];
  preflight: CoaLifecyclePreflightResponse;
  resolutions: CoaLifecycleResolution[];
}): Promise<void> {
  const sourceIds = new Set(accountIds);
  const replacementIds = uniqueSorted(
    resolutions.flatMap((resolution) =>
      resolution.action === 'replace' && resolution.replacementCoaId
        ? [resolution.replacementCoaId]
        : [],
    ),
  );
  if (replacementIds.some((id) => sourceIds.has(id))) {
    throw new AppError(
      'Replacement accounts cannot be part of the lifecycle request',
      undefined,
      false,
      ErrorCode.INVALID_INPUT,
    );
  }
  if (replacementIds.length > 0) {
    const replacements = await trx('coa')
      .where({ company_id: companyId, is_active: true, is_deleted: false })
      .whereIn('id', replacementIds)
      .orderBy('id')
      .forUpdate()
      .select<{ id: string }[]>('id');
    if (replacements.length !== replacementIds.length) {
      throw new AppError(
        'Replacement accounts must be active company-owned accounts',
        undefined,
        false,
        ErrorCode.INVALID_INPUT,
      );
    }
  }

  const accountPreflight = new Map(
    preflight.accounts.map((account) => [account.id, account]),
  );
  for (const resolution of resolutions) {
    const account = accountPreflight.get(resolution.sourceCoaId);
    if (!account) {
      throw new AppError(
        `Resolution source account is not in request: ${resolution.sourceCoaId}`,
        undefined,
        false,
        ErrorCode.INVALID_INPUT,
      );
    }
    assertResolutionReferences(account, resolution);
    if (resolution.action === 'replace' && !resolution.replacementCoaId) {
      throw new AppError(
        'Replacement account is required for replace actions',
        undefined,
        false,
        ErrorCode.INVALID_INPUT,
      );
    }
  }
  assertResolutionSetIsConsistent(resolutions);

  for (const resolution of resolutions) {
    if (resolution.action !== 'replace') continue;
    await applyReplacementResolution({
      trx,
      companyId,
      userId,
      resolution,
    });
  }

  const draftJournalIds = destructiveReferenceIds(resolutions, 'draft_journal');
  if (draftJournalIds.length > 0) {
    await voidDraftJournalsForCoaResolution({
      trx,
      companyId,
      userId,
      journalIds: draftJournalIds,
    });
  }

  const recurringTemplateIds = destructiveReferenceIds(
    resolutions,
    'recurring_template',
  );
  if (recurringTemplateIds.length > 0) {
    await closeRecurringTemplatesForCoaResolution({
      trx,
      companyId,
      templateIds: recurringTemplateIds,
    });
  }

  const categorizationRuleIds = destructiveReferenceIds(
    resolutions,
    'categorization_rule',
  );
  if (categorizationRuleIds.length > 0) {
    await disableCategorizationRulesForCoaResolution({
      trx,
      companyId,
      userId,
      ruleIds: categorizationRuleIds,
    });
  }
}

async function applyReplacementResolution({
  trx,
  companyId,
  userId,
  resolution,
}: {
  trx: Knex.Transaction;
  companyId: string;
  userId: string;
  resolution: CoaLifecycleResolution;
}): Promise<void> {
  if (resolution.action !== 'replace') {
    throw new Error('Expected a replacement resolution');
  }

  if (resolution.referenceType === 'draft_journal') {
    return replaceCoaInDraftJournals({
      trx,
      companyId,
      userId,
      sourceCoaId: resolution.sourceCoaId,
      replacementCoaId: resolution.replacementCoaId!,
      journalIds: resolution.referenceIds,
    });
  }

  if (resolution.referenceType === 'recurring_template') {
    return replaceCoaInRecurringTemplates({
      trx,
      companyId,
      sourceCoaId: resolution.sourceCoaId,
      replacementCoaId: resolution.replacementCoaId!,
      templateIds: resolution.referenceIds,
    });
  }

  return replaceCoaInCategorizationRules({
    trx,
    companyId,
    userId,
    sourceCoaId: resolution.sourceCoaId,
    replacementCoaId: resolution.replacementCoaId!,
    ruleIds: resolution.referenceIds,
  });
}

function assertResolutionSetIsConsistent(
  resolutions: CoaLifecycleResolution[],
): void {
  const sourceReferenceActions = new Map<string, string>();
  const referenceActions = new Map<string, Set<string>>();

  for (const resolution of resolutions) {
    for (const referenceId of resolution.referenceIds) {
      const sourceReferenceKey = [
        resolution.referenceType,
        resolution.sourceCoaId,
        referenceId,
      ].join(':');
      if (sourceReferenceActions.has(sourceReferenceKey)) {
        throw new AppError(
          `Reference ${referenceId} has more than one resolution for the same account`,
          undefined,
          false,
          ErrorCode.INVALID_INPUT,
        );
      }
      sourceReferenceActions.set(sourceReferenceKey, resolution.action);

      const referenceKey = `${resolution.referenceType}:${referenceId}`;
      const actions = referenceActions.get(referenceKey) ?? new Set<string>();
      actions.add(resolution.action);
      referenceActions.set(referenceKey, actions);
    }
  }

  for (const [referenceKey, actions] of referenceActions) {
    if (
      actions.size > 1 &&
      [...actions].some((action) => action !== 'replace')
    ) {
      throw new AppError(
        `Reference ${referenceKey} has contradictory lifecycle resolutions`,
        undefined,
        false,
        ErrorCode.INVALID_INPUT,
      );
    }
  }
}

function destructiveReferenceIds(
  resolutions: CoaLifecycleResolution[],
  referenceType: CoaLifecycleResolution['referenceType'],
): string[] {
  return uniqueSorted(
    resolutions.flatMap((resolution) =>
      resolution.referenceType === referenceType &&
      resolution.action !== 'replace'
        ? resolution.referenceIds
        : [],
    ),
  );
}

function assertResolutionReferences(
  account: CoaLifecycleAccountPreflight,
  resolution: CoaLifecycleResolution,
): void {
  const available =
    resolution.referenceType === 'draft_journal'
      ? account.references.draftJournals
      : resolution.referenceType === 'recurring_template'
        ? account.references.recurringTemplates
        : account.references.categorizationRules.filter(
            (reference) => reference.resolvable !== false,
          );
  const availableIds = new Set(available.map((reference) => reference.id));
  const invalid = resolution.referenceIds.filter((id) => !availableIds.has(id));
  if (invalid.length > 0) {
    throw new AppError(
      `Resolution references are stale or not resolvable: ${invalid.join(', ')}`,
      undefined,
      false,
      ErrorCode.CONFLICT,
    );
  }
}

function assertLifecycleCanExecute({
  preflight,
  acknowledgeUnresolvedArchiveReferences,
}: {
  preflight: CoaLifecyclePreflightResponse;
  acknowledgeUnresolvedArchiveReferences: boolean;
}): void {
  const blocked = preflight.accounts.filter(
    (account) => account.blockers.length > 0,
  );
  if (blocked.length > 0) {
    throw new AppError(
      'Chart of accounts lifecycle operation has immutable blockers',
      { accounts: blocked },
      false,
      ErrorCode.OPERATION_NOT_ALLOWED,
    );
  }

  const unresolved = preflight.accounts.filter(hasOperationalReferences);
  if (
    unresolved.length > 0 &&
    (preflight.operation === 'delete' ||
      !acknowledgeUnresolvedArchiveReferences)
  ) {
    throw new AppError(
      'Chart of accounts lifecycle operation has unresolved references',
      { accounts: unresolved },
      false,
      ErrorCode.OPERATION_NOT_ALLOWED,
    );
  }
}

function hasOperationalReferences(
  account: CoaLifecycleAccountPreflight,
): boolean {
  return (
    account.references.draftJournals.length > 0 ||
    account.references.recurringTemplates.length > 0 ||
    account.references.categorizationRules.length > 0
  );
}

function hasReferences(
  references: Awaited<
    ReturnType<typeof inspectCoaLifecycleImpacts>
  >['referencesByCoaId'] extends Map<string, infer T>
    ? T
    : never,
): boolean {
  return (
    references.draftJournals.length > 0 ||
    references.recurringTemplates.length > 0 ||
    references.categorizationRules.length > 0
  );
}

function referenceIds(references: Array<{ id: string }>): string[] {
  return references.map((reference) => reference.id).sort();
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort();
}
