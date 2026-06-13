import type { Knex } from 'knex';

import { generateFingerprintSync } from '../../shared/index.js';
import { normalizeContactName } from '../contacts/contact-normalization.utils.js';
import { chooseContactMatch } from '../contacts/contact-resolution-selection.utils.js';
import { ensureContactTypeAssignment } from '../contacts/contact-type-assignments.service.js';
import {
  writeContactAliasConfirmedAudit,
  writeContactAliasCreatedAudit,
  writeContactCreatedAudit,
  writeContactResolutionChangedAudit,
  writeContactResolutionConfirmedAudit,
} from '../contacts/contacts.audit.js';
import { getSystemUser } from '../users/users.model.js';

import type { ContactType } from '../contacts/index.js';

type BankTransactionSource = 'file_import' | 'bank_feed' | 'manual_entry';
type ObservedCounterpartySource =
  | 'bank_feed'
  | 'file_import'
  | 'manual_upload'
  | 'system';

type ResolutionStatus =
  | 'unresolved'
  | 'ambiguous'
  | 'inferred'
  | 'confirmed'
  | 'manual_override'
  | 'ignored';
type ResolutionSource =
  | 'none'
  | 'observed_counterparty'
  | 'alias'
  | 'heuristic'
  | 'import'
  | 'rule'
  | 'user'
  | 'system';

type InsertedBankTransaction = {
  id: string;
  idempotency_key: string;
  payee: string | null;
  description?: string | null;
  source_payload?: Record<string, unknown> | null;
  importResolution?: ImportContactResolution | null;
};

type ObservedCounterparty = {
  id: string;
  fingerprint: string;
  status: 'active' | 'ignored';
};

type ContactMatch = {
  contactId: string | null;
  aliasId: string | null;
  source: Extract<ResolutionSource, 'alias' | 'heuristic' | 'system'>;
  confidence: number | null;
  reason: string;
  status?: Extract<ResolutionStatus, 'ambiguous'>;
};

type ReliableProviderCounterparty = {
  name: string;
  alias: string;
  providerEntityId: string;
  confidence: number;
};

type ImportContactResolution = {
  contactId: string;
  contactType?: ContactType | null;
  reason?: string | null;
};

export const normalizeCounterpartyName = normalizeContactName;

export function createCounterpartyFingerprint(input: {
  companyId: string;
  normalizedName: string;
  source: ObservedCounterpartySource;
}): string {
  return generateFingerprintSync(
    `${input.companyId}|${input.source}|${input.normalizedName}`,
  );
}

function createProviderCounterpartyFingerprint(input: {
  companyId: string;
  providerEntityId: string;
  source: ObservedCounterpartySource;
}): string {
  return generateFingerprintSync(
    `${input.companyId}|${input.source}|provider_entity|${input.providerEntityId}`,
  );
}

export async function createBankTransactionContactResolutions({
  trx,
  companyId,
  userId,
  source,
  transactions,
}: {
  trx: Knex.Transaction;
  companyId: string;
  userId: string;
  source: BankTransactionSource;
  transactions: InsertedBankTransaction[];
}): Promise<{
  observedCounterparties: number;
  resolutionRows: number;
  inferredContacts: number;
  aliasesCreated: number;
}> {
  if (transactions.length === 0) {
    return {
      observedCounterparties: 0,
      resolutionRows: 0,
      inferredContacts: 0,
      aliasesCreated: 0,
    };
  }

  const observedSource = toObservedCounterpartySource(source);
  const observedInputs = buildObservedInputs({
    companyId,
    observedSource,
    transactions,
  });

  const observedByFingerprint = await upsertObservedCounterparties({
    trx,
    companyId,
    observedInputs,
  });

  let inferredContacts = 0;
  let aliasesCreated = 0;
  const resolutions = [];

  for (const transaction of transactions) {
    const payee = transaction.payee?.trim() || null;
    const reliableCounterparty = getReliableProviderCounterparty(
      transaction.source_payload,
    );
    const matchName = reliableCounterparty?.name ?? payee;
    const aliasText = reliableCounterparty?.alias ?? payee;
    const normalizedName = matchName
      ? normalizeCounterpartyName(matchName)
      : null;
    const fingerprint = getObservedFingerprint({
      companyId,
      source: observedSource,
      normalizedName,
      reliableCounterparty,
    });
    const observed = fingerprint
      ? observedByFingerprint.get(fingerprint)
      : undefined;

    let match: ContactMatch | null = null;

    const importMatch = transaction.importResolution
      ? await resolveImportContact({
          trx,
          companyId,
          userId,
          bankTransactionId: transaction.id,
          observedCounterpartyId: observed?.id ?? null,
          alias: aliasText,
          importResolution: transaction.importResolution,
        })
      : null;

    if (importMatch) {
      resolutions.push(importMatch);
      continue;
    }

    if (observed?.status === 'ignored') {
      resolutions.push({
        bank_transaction_id: transaction.id,
        company_id: companyId,
        observed_counterparty_id: observed.id,
        contact_id: null,
        contact_alias_id: null,
        contact_type: null,
        status: 'ignored',
        source: 'system',
        confidence: null,
        resolution_reason: 'Observed counterparty is ignored',
        resolved_at: trx.fn.now(),
        resolved_by_id: null,
      });
      continue;
    }

    const normalizedAliasText = aliasText
      ? normalizeCounterpartyName(aliasText)
      : null;
    const normalizedEvidence = Array.from(
      new Set([normalizedName, normalizedAliasText].filter(Boolean)),
    ) as string[];

    match = normalizedEvidence.length
      ? await resolveExistingContact({
          trx,
          companyId,
          normalizedNames: normalizedEvidence,
        })
      : null;

    if (!match) {
      match = observed
        ? await resolveFromObservedHistory({
            trx,
            companyId,
            observedCounterpartyId: observed.id,
          })
        : null;
    }

    if (!match) {
      if (reliableCounterparty) {
        match = await createSystemInferredContact({
          trx,
          companyId,
          observedCounterpartyId: observed?.id ?? null,
          counterparty: reliableCounterparty,
        });
        inferredContacts += 1;
        aliasesCreated += 1;
      }
    } else if (match.contactId && aliasText) {
      const matchedAlias = await createAliasForMatch({
        trx,
        companyId,
        userId,
        contactId: match.contactId,
        observedCounterpartyId: observed?.id ?? null,
        alias: aliasText,
        normalizedAlias: normalizeCounterpartyName(aliasText),
        confidence: match.confidence ?? 1,
        verificationStatus: 'system_inferred',
      });
      if (matchedAlias.id) {
        match.aliasId = matchedAlias.id;
        match.source = 'alias';
      }
      if (matchedAlias.created) aliasesCreated += 1;
    }

    const hasContact = Boolean(match?.contactId);
    const status: ResolutionStatus =
      match?.status ?? (hasContact ? 'inferred' : 'unresolved');
    const resolutionSource: ResolutionSource = match?.source ?? 'none';

    resolutions.push({
      bank_transaction_id: transaction.id,
      company_id: companyId,
      observed_counterparty_id: observed?.id ?? null,
      contact_id: match?.contactId ?? null,
      contact_alias_id: match?.aliasId ?? null,
      contact_type: null,
      status,
      source: resolutionSource,
      confidence: match?.confidence ?? null,
      resolution_reason: match?.reason ?? null,
      resolved_at: status === 'unresolved' ? null : trx.fn.now(),
      resolved_by_id: null,
    });
  }

  await trx('bank_transaction_contact_resolutions')
    .insert(resolutions)
    .onConflict(['bank_transaction_id'])
    .ignore();

  return {
    observedCounterparties: observedInputs.length,
    resolutionRows: resolutions.length,
    inferredContacts,
    aliasesCreated,
  };
}

function toObservedCounterpartySource(
  source: BankTransactionSource,
): ObservedCounterpartySource {
  if (source === 'bank_feed') return 'bank_feed';
  if (source === 'file_import') return 'file_import';
  return 'manual_upload';
}

function buildObservedInputs({
  companyId,
  observedSource,
  transactions,
}: {
  companyId: string;
  observedSource: ObservedCounterpartySource;
  transactions: InsertedBankTransaction[];
}) {
  const byFingerprint = new Map<
    string,
    {
      company_id: string;
      observed_name: string;
      normalized_name: string;
      fingerprint: string;
      source: ObservedCounterpartySource;
      status: 'active';
      last_bank_transaction_id: string;
      observation_count: number;
      metadata: Record<string, unknown>;
    }
  >();

  for (const transaction of transactions) {
    const reliableCounterparty = getReliableProviderCounterparty(
      transaction.source_payload,
    );
    const observedName =
      reliableCounterparty?.name ?? transaction.payee?.trim();
    if (!observedName) continue;

    const normalizedName = normalizeCounterpartyName(observedName);
    if (!normalizedName) continue;

    const fingerprint = getObservedFingerprint({
      companyId,
      source: observedSource,
      normalizedName,
      reliableCounterparty,
    });
    if (!fingerprint) continue;

    const existing = byFingerprint.get(fingerprint);
    if (existing) {
      existing.observation_count += 1;
      existing.last_bank_transaction_id = transaction.id;
      continue;
    }

    byFingerprint.set(fingerprint, {
      company_id: companyId,
      observed_name: observedName,
      normalized_name: normalizedName,
      fingerprint,
      source: observedSource,
      status: 'active',
      last_bank_transaction_id: transaction.id,
      observation_count: 1,
      metadata: reliableCounterparty
        ? {
            provider_entity_id: reliableCounterparty.providerEntityId,
            provider_confidence: reliableCounterparty.confidence,
          }
        : {},
    });
  }

  return Array.from(byFingerprint.values());
}

function getObservedFingerprint({
  companyId,
  source,
  normalizedName,
  reliableCounterparty,
}: {
  companyId: string;
  source: ObservedCounterpartySource;
  normalizedName: string | null;
  reliableCounterparty: ReliableProviderCounterparty | null;
}): string | null {
  if (reliableCounterparty) {
    return createProviderCounterpartyFingerprint({
      companyId,
      source,
      providerEntityId: reliableCounterparty.providerEntityId,
    });
  }

  if (!normalizedName) return null;

  return createCounterpartyFingerprint({
    companyId,
    source,
    normalizedName,
  });
}

async function resolveImportContact({
  trx,
  companyId,
  userId,
  bankTransactionId,
  observedCounterpartyId,
  alias,
  importResolution,
}: {
  trx: Knex.Transaction;
  companyId: string;
  userId: string;
  bankTransactionId: string;
  observedCounterpartyId: string | null;
  alias: string | null;
  importResolution: ImportContactResolution;
}) {
  const contact = await trx('contacts')
    .where({
      id: importResolution.contactId,
      company_id: companyId,
      status: 'active',
      is_deleted: false,
    })
    .select('id')
    .first();

  if (!contact) {
    return {
      bank_transaction_id: bankTransactionId,
      company_id: companyId,
      observed_counterparty_id: observedCounterpartyId,
      contact_id: null,
      contact_alias_id: null,
      contact_type: null,
      status: 'unresolved',
      source: 'none',
      confidence: null,
      resolution_reason:
        'Import supplied contact was not found, archived, or deleted',
      resolved_at: null,
      resolved_by_id: null,
    };
  }

  await ensureContactTypeAssignment({
    trx,
    companyId,
    contactId: importResolution.contactId,
    contactType: importResolution.contactType,
    userId,
  });

  const contactAlias = alias
    ? await createAliasForMatch({
        trx,
        companyId,
        userId,
        contactId: importResolution.contactId,
        observedCounterpartyId,
        alias,
        normalizedAlias: normalizeCounterpartyName(alias),
        confidence: 1,
        verificationStatus: 'user_confirmed',
        aliasSource: 'import',
      })
    : null;
  const contactAliasId = contactAlias?.id ?? null;

  await writeContactResolutionChangedAudit({
    companyId,
    entityId: bankTransactionId,
    actor: { type: 'user', userId },
    trx,
    context: { source: 'import' },
    payload: {
      bankTransactionId,
      previousContactId: null,
      nextContactId: importResolution.contactId,
      previousContactType: null,
      nextContactType: importResolution.contactType ?? null,
      previousStatus: null,
      nextStatus: 'confirmed',
      source: 'import',
      reason:
        importResolution.reason ??
        'Contact supplied during bank transaction import',
    },
  });
  await writeContactResolutionConfirmedAudit({
    companyId,
    entityId: bankTransactionId,
    actor: { type: 'user', userId },
    trx,
    context: { source: 'import' },
    payload: {
      observedCounterpartyId,
      contactId: importResolution.contactId,
      contactAliasId,
      updatedResolutionCount: 1,
      reason:
        importResolution.reason ??
        'Contact supplied during bank transaction import',
    },
  });

  return {
    bank_transaction_id: bankTransactionId,
    company_id: companyId,
    observed_counterparty_id: observedCounterpartyId,
    contact_id: importResolution.contactId,
    contact_alias_id: contactAliasId,
    contact_type: importResolution.contactType ?? null,
    status: 'confirmed',
    source: 'import',
    confidence: 1,
    resolution_reason:
      importResolution.reason ??
      'Contact supplied during bank transaction import',
    resolved_at: trx.fn.now(),
    resolved_by_id: userId,
  };
}

async function upsertObservedCounterparties({
  trx,
  companyId,
  observedInputs,
}: {
  trx: Knex.Transaction;
  companyId: string;
  observedInputs: ReturnType<typeof buildObservedInputs>;
}): Promise<Map<string, ObservedCounterparty>> {
  if (observedInputs.length === 0) {
    return new Map();
  }

  await trx('observed_counterparties')
    .insert(observedInputs)
    .onConflict(['company_id', 'source', 'fingerprint'])
    .merge({
      observed_name: trx.raw('excluded.observed_name'),
      normalized_name: trx.raw('excluded.normalized_name'),
      last_bank_transaction_id: trx.raw('excluded.last_bank_transaction_id'),
      metadata: trx.raw(
        'observed_counterparties.metadata || excluded.metadata',
      ),
      observation_count: trx.raw(
        'observed_counterparties.observation_count + excluded.observation_count',
      ),
      last_observed_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });

  const rows = await trx('observed_counterparties')
    .where('company_id', companyId)
    .whereIn(
      'fingerprint',
      observedInputs.map((input) => input.fingerprint),
    )
    .select<ObservedCounterparty[]>('id', 'fingerprint', 'status');

  return new Map(rows.map((row) => [row.fingerprint, row]));
}

async function resolveExistingContact({
  trx,
  companyId,
  normalizedNames,
}: {
  trx: Knex.Transaction;
  companyId: string;
  normalizedNames: string[];
}): Promise<ContactMatch | null> {
  const aliases = await trx('contact_aliases as ca')
    .join('contacts as c', function joinContacts() {
      this.on('c.id', '=', 'ca.contact_id').andOn(
        'c.company_id',
        '=',
        'ca.company_id',
      );
    })
    .where({
      'ca.company_id': companyId,
      'ca.is_deleted': false,
      'c.status': 'active',
      'c.is_deleted': false,
    })
    .whereIn('ca.normalized_alias', normalizedNames)
    .whereNot('ca.verification_status', 'rejected')
    .select<{ id: string; contact_id: string }[]>('ca.id', 'ca.contact_id');

  const contacts = await trx('contacts')
    .where({
      company_id: companyId,
      status: 'active',
      is_deleted: false,
    })
    .whereIn('normalized_name', normalizedNames)
    .select<{ id: string }[]>('id');

  return chooseContactMatch({ aliases, contacts });
}

async function resolveFromObservedHistory({
  trx,
  companyId,
  observedCounterpartyId,
}: {
  trx: Knex.Transaction;
  companyId: string;
  observedCounterpartyId: string;
}): Promise<ContactMatch | null> {
  const history = await trx('bank_transaction_contact_resolutions as bcr')
    .join('contacts as c', function joinContacts() {
      this.on('c.id', '=', 'bcr.contact_id').andOn(
        'c.company_id',
        '=',
        'bcr.company_id',
      );
    })
    .leftJoin('contact_aliases as ca', function joinAliases() {
      this.on('ca.id', '=', 'bcr.contact_alias_id')
        .andOn('ca.company_id', '=', 'bcr.company_id')
        .andOn('ca.contact_id', '=', 'bcr.contact_id');
    })
    .where({
      'bcr.company_id': companyId,
      'bcr.observed_counterparty_id': observedCounterpartyId,
      'c.status': 'active',
      'c.is_deleted': false,
    })
    .whereNotNull('bcr.contact_id')
    .andWhere((qb) => {
      qb.whereNull('bcr.contact_alias_id').orWhere((aliasQb) => {
        aliasQb
          .where('ca.is_deleted', false)
          .whereNot('ca.verification_status', 'rejected');
      });
    })
    .select('bcr.contact_id', 'bcr.contact_alias_id')
    .orderBy('bcr.resolved_at', 'desc');

  if (history.length === 0) return null;

  const contactIds = new Set(history.map((row) => row.contact_id));
  if (contactIds.size > 1) {
    return {
      contactId: null,
      aliasId: null,
      source: 'system',
      confidence: null,
      status: 'ambiguous',
      reason: 'Active resolution history identifies multiple contacts',
    };
  }

  const [existing] = history;

  return {
    contactId: existing.contact_id,
    aliasId: existing.contact_alias_id,
    source: 'system',
    confidence: 0.99,
    reason: 'Previously resolved provider-stable observed counterparty',
  };
}

async function createSystemInferredContact({
  trx,
  companyId,
  observedCounterpartyId,
  counterparty,
}: {
  trx: Knex.Transaction;
  companyId: string;
  observedCounterpartyId: string | null;
  counterparty: ReliableProviderCounterparty;
}): Promise<ContactMatch> {
  const existingAliasMatch = await resolveExistingContact({
    trx,
    companyId,
    normalizedNames: [
      normalizeCounterpartyName(counterparty.name),
      normalizeCounterpartyName(counterparty.alias),
    ],
  });

  if (existingAliasMatch) {
    return existingAliasMatch;
  }

  const systemUser = await getSystemUser({ trx, deterministic: true });
  const normalizedName = normalizeCounterpartyName(counterparty.name);
  const [contact] = await trx('contacts')
    .insert({
      company_id: companyId,
      display_name: counterparty.name,
      normalized_name: normalizedName,
      created_via: 'system_inferred',
      review_status: 'unreviewed',
      status: 'active',
      created_by_id: systemUser.id,
      updated_by_id: systemUser.id,
    })
    .returning<{ id: string }[]>('id');

  const alias = await createAliasForMatch({
    trx,
    companyId,
    userId: systemUser.id,
    contactId: contact.id,
    observedCounterpartyId,
    alias: counterparty.alias,
    normalizedAlias: normalizeCounterpartyName(counterparty.alias),
    confidence: counterparty.confidence,
    verificationStatus: 'system_inferred',
  });

  await writeContactCreatedAudit({
    companyId,
    entityId: contact.id,
    actor: { type: 'system' },
    trx,
    context: { source: 'worker' },
    payload: {
      displayName: counterparty.name,
      createdVia: 'system_inferred',
      reviewStatus: 'unreviewed',
    },
  });

  return {
    contactId: contact.id,
    aliasId: alias.id,
    source: 'system',
    confidence: counterparty.confidence,
    reason: 'Provider supplied stable counterparty identity',
  };
}

async function createAliasForMatch({
  trx,
  companyId,
  userId,
  contactId,
  observedCounterpartyId,
  alias,
  normalizedAlias,
  confidence,
  verificationStatus,
  aliasSource = 'bank_counterparty',
}: {
  trx: Knex.Transaction;
  companyId: string;
  userId: string;
  contactId: string;
  observedCounterpartyId: string | null;
  alias: string;
  normalizedAlias: string;
  confidence: number;
  verificationStatus: 'system_inferred' | 'user_confirmed';
  aliasSource?: 'bank_counterparty' | 'import' | 'user' | 'system';
}): Promise<{ id: string; created: boolean }> {
  const creatorUserId =
    verificationStatus === 'system_inferred'
      ? (await getSystemUser({ trx, deterministic: true })).id
      : userId;
  const [inserted] = await trx('contact_aliases')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      observed_counterparty_id: observedCounterpartyId,
      alias,
      normalized_alias: normalizedAlias,
      source: aliasSource,
      confidence,
      verification_status: verificationStatus,
      verified_by_id: verificationStatus === 'user_confirmed' ? userId : null,
      verified_at:
        verificationStatus === 'user_confirmed' ? trx.fn.now() : null,
      is_primary: false,
      created_by_id: creatorUserId,
      updated_by_id: creatorUserId,
    })
    .onConflict(
      trx.raw('(company_id, normalized_alias) WHERE is_deleted = false'),
    )
    .ignore()
    .returning<{ id: string }[]>('id');

  if (inserted) {
    await writeContactAliasCreatedAudit({
      companyId,
      entityId: inserted.id,
      actor:
        verificationStatus === 'user_confirmed'
          ? { type: 'user', userId }
          : { type: 'system' },
      trx,
      context: {
        source: aliasSource === 'import' ? 'import' : 'worker',
      },
      payload: {
        aliasId: inserted.id,
        contactId,
        alias,
        action: 'created',
      },
    });
    return { id: inserted.id, created: true };
  }

  const existing = await trx('contact_aliases')
    .where({
      company_id: companyId,
      normalized_alias: normalizedAlias,
      is_deleted: false,
    })
    .select('id', 'contact_id')
    .first();

  if (existing?.contact_id !== contactId) {
    throw new Error('Active alias already belongs to another contact');
  }

  if (verificationStatus === 'user_confirmed') {
    await trx('contact_aliases')
      .where({ id: existing.id, company_id: companyId })
      .update({
        verification_status: 'user_confirmed',
        verified_by_id: userId,
        verified_at: trx.fn.now(),
        confidence: 1,
        updated_by_id: userId,
        updated_at: trx.fn.now(),
      });

    await writeContactAliasConfirmedAudit({
      companyId,
      entityId: existing.id,
      actor: { type: 'user', userId },
      trx,
      context: { source: aliasSource === 'import' ? 'import' : 'web' },
      payload: {
        aliasId: existing.id,
        contactId,
        alias,
        action: 'confirmed',
      },
    });
  }

  return { id: existing.id, created: false };
}

function getReliableProviderCounterparty(
  sourcePayload?: Record<string, unknown> | null,
): ReliableProviderCounterparty | null {
  const counterparty = readObject(sourcePayload?.counterparty);
  const contact = readObject(sourcePayload?.contact);
  const candidate = counterparty ?? contact;
  if (!candidate) return null;

  const name = readString(candidate.name) ?? readString(candidate.display_name);
  const alias =
    readString(candidate.alias) ??
    readString(sourcePayload?.merchant_name) ??
    name;
  const providerEntityId =
    readString(candidate.provider_entity_id) ??
    readString(candidate.entity_id) ??
    readString(candidate.id);
  const confidence = readNumber(candidate.confidence) ?? 1;

  if (!name || !alias || !providerEntityId || confidence < 0.98) {
    return null;
  }

  return {
    name: name.trim(),
    alias: alias.trim(),
    providerEntityId,
    confidence,
  };
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
