import type { Knex } from 'knex';
import z from 'zod';

import { knexClient } from '../../db/knexClient.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  AppError,
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { normalizeContactName } from './contact-normalization.utils.js';
import {
  confirmContactResolutionInput,
  contactAliasesQueryInput,
  contactResolutionReviewQueueInput,
  createContactFromObservedCounterpartyInput,
  ignoreObservedCounterpartyInput,
  linkObservedCounterpartyInput,
  reassignContactAliasInput,
  rejectInferredContactInput,
} from './contact-resolution-review.types.js';
import {
  writeContactAliasConfirmedAudit,
  writeContactAliasCreatedAudit,
  writeContactAliasDeletedAudit,
  writeContactAliasReassignedAudit,
  writeContactAliasRejectedAudit,
  writeContactConfirmedAudit,
  writeContactCreatedFromObservedCounterpartyAudit,
  writeContactRejectedAudit,
  writeContactResolutionConfirmedAudit,
  writeContactResolutionIgnoredAudit,
  writeContactResolutionLinkedAudit,
  writeContactResolutionOverriddenAudit,
} from './contacts.audit.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type {
  ConfirmContactResolutionInput,
  ContactAliasesQueryInput,
  ContactResolutionReviewQueueInput,
  CreateContactFromObservedCounterpartyInput,
  IgnoreObservedCounterpartyInput,
  LinkObservedCounterpartyInput,
  ReassignContactAliasInput,
  RejectInferredContactInput,
  ResolutionReviewStatus,
} from './contact-resolution-review.types.js';

type ObservedCounterpartyRow = {
  id: string;
  company_id: string;
  observed_name: string;
  normalized_name: string;
  source: string;
};

type ContactRow = {
  id: string;
  display_name: string;
  created_via: string;
  review_status: string;
};

type ContactAliasRow = {
  id: string;
  contact_id: string;
  observed_counterparty_id: string | null;
  alias: string;
  normalized_alias: string;
  is_primary: boolean;
};

type ResolutionRow = {
  id: string;
  bank_transaction_id: string;
  observed_counterparty_id: string | null;
  contact_id: string | null;
  contact_alias_id: string | null;
  status: ResolutionReviewStatus;
};

const DEFAULT_REVIEW_STATUSES: ResolutionReviewStatus[] = [
  'unresolved',
  'ambiguous',
  'inferred',
];

export async function getContactResolutionReviewQueue(
  input: ContactResolutionReviewQueueInput & { companyId: string },
): Promise<ApiResponse> {
  const parsed = contactResolutionReviewQueueInput.safeParse(input);
  if (!parsed.success) {
    return errorResponse('Invalid input', z.treeifyError(parsed.error), {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  try {
    const result = await knexClient.transaction(async (trx) => {
      const companyUUID = await resolveCompanyUUID(input.companyId, trx);
      const statuses = parsed.data.statuses ?? DEFAULT_REVIEW_STATUSES;
      const offset = (parsed.data.page - 1) * parsed.data.limit;

      const observedBase = trx('observed_counterparties as oc')
        .join(
          'bank_transaction_contact_resolutions as bcr',
          'bcr.observed_counterparty_id',
          'oc.id',
        )
        .where('oc.company_id', companyUUID)
        .whereIn('bcr.status', statuses);

      if (parsed.data.search) {
        observedBase.andWhere((qb) => {
          qb.whereILike(
            'oc.observed_name',
            `%${parsed.data.search}%`,
          ).orWhereILike('oc.normalized_name', `%${parsed.data.search}%`);
        });
      }

      const observedCountRow = await observedBase
        .clone()
        .clearSelect()
        .clearOrder()
        .countDistinct('oc.id as count')
        .first();
      const observedTotal = Number(observedCountRow?.count ?? 0);

      const observedCounterparties = await observedBase
        .clone()
        .leftJoin('contacts as c', 'c.id', 'bcr.contact_id')
        .select(
          'oc.id',
          'oc.observed_name as observedName',
          'oc.normalized_name as normalizedName',
          'oc.source',
          'oc.status',
          'oc.observation_count as observationCount',
          'oc.first_observed_at as firstObservedAt',
          'oc.last_observed_at as lastObservedAt',
          trx.raw(
            'COUNT(DISTINCT bcr.bank_transaction_id)::int as "transactionCount"',
          ),
          trx.raw(
            `COUNT(*) FILTER (WHERE bcr.status = 'unresolved')::int as "unresolvedCount"`,
          ),
          trx.raw(
            `COUNT(*) FILTER (WHERE bcr.status = 'ambiguous')::int as "ambiguousCount"`,
          ),
          trx.raw(
            `COUNT(*) FILTER (WHERE bcr.status = 'inferred')::int as "inferredCount"`,
          ),
          trx.raw(
            `COUNT(*) FILTER (WHERE bcr.status IN ('confirmed', 'manual_override'))::int as "confirmedCount"`,
          ),
          trx.raw('MAX(bcr.confidence)::float as "maxConfidence"'),
          trx.raw('MAX(c.display_name) as "currentContactName"'),
        )
        .groupBy(
          'oc.id',
          'oc.observed_name',
          'oc.normalized_name',
          'oc.source',
          'oc.status',
          'oc.observation_count',
          'oc.first_observed_at',
          'oc.last_observed_at',
        )
        .orderBy('oc.last_observed_at', 'desc')
        .limit(parsed.data.limit)
        .offset(offset);

      const inferredContacts = parsed.data.includeInferredContacts
        ? await getUnreviewedInferredContacts({
            trx,
            companyId: companyUUID,
            search: parsed.data.search,
            limit: parsed.data.limit,
          })
        : [];

      return {
        observedCounterparties,
        inferredContacts,
        pagination: {
          currentPage: parsed.data.page,
          pageSize: parsed.data.limit,
          total: observedTotal,
          totalPages: Math.max(1, Math.ceil(observedTotal / parsed.data.limit)),
          hasNext: offset + observedCounterparties.length < observedTotal,
          hasPrev: parsed.data.page > 1,
        },
      };
    });

    return successResponse('Contact resolution review queue fetched', result);
  } catch (error) {
    return errorResponse(
      'Failed to fetch contact resolution review queue',
      error,
    );
  }
}

export async function confirmContactResolution({
  companyId,
  userId,
  input,
}: {
  companyId: string;
  userId: string;
  input: ConfirmContactResolutionInput;
}): Promise<ApiResponse> {
  const parsed = confirmContactResolutionInput.safeParse(input);
  if (!parsed.success) {
    return errorResponse('Invalid input', z.treeifyError(parsed.error), {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  try {
    const result = await knexClient.transaction(async (trx) => {
      const companyUUID = await resolveCompanyUUID(companyId, trx);
      const resolution = await findResolutionForReview({
        trx,
        companyId: companyUUID,
        resolutionId: parsed.data.resolutionId,
        bankTransactionId: parsed.data.bankTransactionId,
      });

      if (!resolution.contact_id) {
        throw new AppError(
          'Resolution has no contact to confirm',
          undefined,
          false,
          ErrorCode.INVALID_INPUT,
        );
      }

      const contact = await getActiveContact({
        trx,
        companyId: companyUUID,
        contactId: resolution.contact_id,
      });

      const observed = resolution.observed_counterparty_id
        ? await getObservedCounterparty({
            trx,
            companyId: companyUUID,
            observedCounterpartyId: resolution.observed_counterparty_id,
          })
        : null;

      const alias = parsed.data.createAlias
        ? await upsertAliasForContact({
            trx,
            companyId: companyUUID,
            userId,
            contactId: contact.id,
            observedCounterpartyId: observed?.id ?? null,
            alias:
              parsed.data.alias ??
              observed?.observed_name ??
              contact.display_name,
            allowExistingForSameContact: true,
          })
        : null;

      await confirmContactIfUnreviewed({
        trx,
        companyId: companyUUID,
        userId,
        contactId: contact.id,
      });

      const updatedResolutionCount = await updateResolutionsForObserved({
        trx,
        companyId: companyUUID,
        userId,
        observedCounterpartyId: observed?.id ?? null,
        fallbackResolutionId: resolution.id,
        contactId: contact.id,
        contactAliasId: alias?.id ?? resolution.contact_alias_id,
        status: 'confirmed',
        reason: 'User confirmed contact resolution',
      });

      if (observed) {
        await trx('observed_counterparties')
          .where({ id: observed.id, company_id: companyUUID })
          .update({ status: 'active', updated_at: trx.fn.now() });
      }

      if (contact.review_status === 'unreviewed') {
        await writeContactConfirmedAudit({
          companyId: companyUUID,
          entityId: contact.id,
          actor: { type: 'user', userId },
          trx,
          context: { source: 'web' },
          payload: {
            previousReviewStatus: 'unreviewed',
            nextReviewStatus: 'confirmed',
            reason: 'User confirmed contact resolution',
          },
        });
      }
      await writeContactResolutionConfirmedAudit({
        companyId: companyUUID,
        entityId: resolution.id,
        actor: { type: 'user', userId },
        trx,
        context: { source: 'web' },
        payload: {
          observedCounterpartyId: observed?.id ?? null,
          contactId: contact.id,
          contactAliasId: alias?.id ?? resolution.contact_alias_id,
          updatedResolutionCount,
          reason: 'User confirmed contact resolution',
        },
      });

      return {
        contactId: contact.id,
        aliasId: alias?.id ?? resolution.contact_alias_id,
        updatedResolutionCount,
      };
    });

    return successResponse('Contact resolution confirmed', result);
  } catch (error) {
    return errorResponse('Failed to confirm contact resolution', error);
  }
}

export async function linkObservedCounterpartyToContact({
  companyId,
  userId,
  input,
}: {
  companyId: string;
  userId: string;
  input: LinkObservedCounterpartyInput;
}): Promise<ApiResponse> {
  const parsed = linkObservedCounterpartyInput.safeParse(input);
  if (!parsed.success) {
    return errorResponse('Invalid input', z.treeifyError(parsed.error), {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  try {
    const result = await knexClient.transaction(async (trx) => {
      const companyUUID = await resolveCompanyUUID(companyId, trx);
      const observed = await getObservedCounterparty({
        trx,
        companyId: companyUUID,
        observedCounterpartyId: parsed.data.observedCounterpartyId,
      });
      const contact = await getActiveContact({
        trx,
        companyId: companyUUID,
        contactId: parsed.data.contactId,
      });
      const alias = await upsertAliasForContact({
        trx,
        companyId: companyUUID,
        userId,
        contactId: contact.id,
        observedCounterpartyId: observed.id,
        alias: parsed.data.alias ?? observed.observed_name,
        allowExistingForSameContact: true,
      });
      const updatedResolutionCount = await updateResolutionsForObserved({
        trx,
        companyId: companyUUID,
        userId,
        observedCounterpartyId: observed.id,
        fallbackResolutionId: null,
        contactId: contact.id,
        contactAliasId: alias.id,
        status: 'manual_override',
        reason: 'User linked observed counterparty to contact',
      });

      await trx('observed_counterparties')
        .where({ id: observed.id, company_id: companyUUID })
        .update({ status: 'active', updated_at: trx.fn.now() });

      await writeContactResolutionLinkedAudit({
        companyId: companyUUID,
        entityId: observed.id,
        actor: { type: 'user', userId },
        trx,
        context: { source: 'web' },
        payload: {
          observedCounterpartyId: observed.id,
          contactId: contact.id,
          contactAliasId: alias.id,
          updatedResolutionCount,
          reason: 'User linked observed counterparty to contact',
        },
      });

      return {
        observedCounterpartyId: observed.id,
        contactId: contact.id,
        aliasId: alias.id,
        updatedResolutionCount,
      };
    });

    return successResponse('Observed counterparty linked to contact', result);
  } catch (error) {
    return errorResponse('Failed to link observed counterparty', error);
  }
}

export async function createContactFromObservedCounterparty({
  companyId,
  userId,
  input,
}: {
  companyId: string;
  userId: string;
  input: CreateContactFromObservedCounterpartyInput;
}): Promise<ApiResponse> {
  const parsed = createContactFromObservedCounterpartyInput.safeParse(input);
  if (!parsed.success) {
    return errorResponse('Invalid input', z.treeifyError(parsed.error), {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  try {
    const result = await knexClient.transaction(async (trx) => {
      const companyUUID = await resolveCompanyUUID(companyId, trx);
      const observed = await getObservedCounterparty({
        trx,
        companyId: companyUUID,
        observedCounterpartyId: parsed.data.observedCounterpartyId,
      });
      const displayName = parsed.data.displayName ?? observed.observed_name;
      const [contact] = await trx('contacts')
        .insert({
          company_id: companyUUID,
          display_name: displayName,
          normalized_name: normalizeContactName(displayName),
          email: parsed.data.email,
          address: parsed.data.address,
          notes: parsed.data.notes,
          status: 'active',
          created_via: 'manual',
          review_status: 'confirmed',
          reviewed_by_id: userId,
          reviewed_at: trx.fn.now(),
          created_by_id: userId,
          updated_by_id: userId,
        })
        .returning<ContactRow[]>([
          'id',
          'display_name',
          'created_via',
          'review_status',
        ]);

      const alias = await upsertAliasForContact({
        trx,
        companyId: companyUUID,
        userId,
        contactId: contact.id,
        observedCounterpartyId: observed.id,
        alias: parsed.data.alias ?? observed.observed_name,
        allowExistingForSameContact: true,
      });
      const updatedResolutionCount = await updateResolutionsForObserved({
        trx,
        companyId: companyUUID,
        userId,
        observedCounterpartyId: observed.id,
        fallbackResolutionId: null,
        contactId: contact.id,
        contactAliasId: alias.id,
        status: 'manual_override',
        reason: 'User created contact from observed counterparty',
      });

      await trx('observed_counterparties')
        .where({ id: observed.id, company_id: companyUUID })
        .update({ status: 'active', updated_at: trx.fn.now() });

      await writeContactCreatedFromObservedCounterpartyAudit({
        companyId: companyUUID,
        entityId: contact.id,
        actor: { type: 'user', userId },
        trx,
        context: { source: 'web' },
        payload: {
          displayName: contact.display_name,
          createdVia: contact.created_via,
          reviewStatus: contact.review_status,
          observedCounterpartyId: observed.id,
        },
      });
      await writeContactResolutionOverriddenAudit({
        companyId: companyUUID,
        entityId: observed.id,
        actor: { type: 'user', userId },
        trx,
        context: { source: 'web' },
        payload: {
          observedCounterpartyId: observed.id,
          contactId: contact.id,
          contactAliasId: alias.id,
          updatedResolutionCount,
          reason: 'User created contact from observed counterparty',
        },
      });

      return {
        observedCounterpartyId: observed.id,
        contactId: contact.id,
        aliasId: alias.id,
        updatedResolutionCount,
      };
    });

    return successResponse(
      'Contact created from observed counterparty',
      result,
    );
  } catch (error) {
    return errorResponse(
      'Failed to create contact from observed counterparty',
      error,
    );
  }
}

export async function ignoreObservedCounterparty({
  companyId,
  userId,
  input,
}: {
  companyId: string;
  userId: string;
  input: IgnoreObservedCounterpartyInput;
}): Promise<ApiResponse> {
  const parsed = ignoreObservedCounterpartyInput.safeParse(input);
  if (!parsed.success) {
    return errorResponse('Invalid input', z.treeifyError(parsed.error), {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  try {
    const result = await knexClient.transaction(async (trx) => {
      const companyUUID = await resolveCompanyUUID(companyId, trx);
      const observed = await getObservedCounterparty({
        trx,
        companyId: companyUUID,
        observedCounterpartyId: parsed.data.observedCounterpartyId,
      });

      const updatedResolutionCount = await trx(
        'bank_transaction_contact_resolutions',
      )
        .where({
          company_id: companyUUID,
          observed_counterparty_id: observed.id,
        })
        .whereIn('status', ['unresolved', 'ambiguous', 'inferred'])
        .update({
          contact_id: null,
          contact_alias_id: null,
          contact_type: null,
          status: 'ignored',
          source: 'user',
          confidence: null,
          resolution_reason:
            parsed.data.reason ?? 'User ignored observed counterparty',
          resolved_by_id: userId,
          resolved_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      await trx('observed_counterparties')
        .where({ id: observed.id, company_id: companyUUID })
        .update({
          status: 'ignored',
          updated_at: trx.fn.now(),
        });

      await writeContactResolutionIgnoredAudit({
        companyId: companyUUID,
        entityId: observed.id,
        actor: { type: 'user', userId },
        trx,
        context: { source: 'web' },
        payload: {
          observedCounterpartyId: observed.id,
          contactId: null,
          contactAliasId: null,
          updatedResolutionCount,
          reason: parsed.data.reason ?? 'User ignored observed counterparty',
        },
      });

      return {
        observedCounterpartyId: observed.id,
        updatedResolutionCount,
      };
    });

    return successResponse('Observed counterparty ignored', result);
  } catch (error) {
    return errorResponse('Failed to ignore observed counterparty', error);
  }
}

export async function rejectInferredContact({
  companyId,
  userId,
  input,
}: {
  companyId: string;
  userId: string;
  input: RejectInferredContactInput;
}): Promise<ApiResponse> {
  const parsed = rejectInferredContactInput.safeParse(input);
  if (!parsed.success) {
    return errorResponse('Invalid input', z.treeifyError(parsed.error), {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  try {
    const result = await knexClient.transaction(async (trx) => {
      const companyUUID = await resolveCompanyUUID(companyId, trx);
      const contact = await getContact({
        trx,
        companyId: companyUUID,
        contactId: parsed.data.contactId,
      });

      if (contact.created_via !== 'system_inferred') {
        throw new AppError(
          'Only system-inferred contacts can be rejected through this workflow',
          undefined,
          false,
          ErrorCode.INVALID_INPUT,
        );
      }

      await trx('contacts')
        .where({ id: contact.id, company_id: companyUUID, is_deleted: false })
        .update({
          status: 'archived',
          review_status: 'rejected',
          reviewed_by_id: userId,
          reviewed_at: trx.fn.now(),
          updated_by_id: userId,
          updated_at: trx.fn.now(),
          notes: parsed.data.reason
            ? trx.raw(`concat_ws(E'\n', nullif(notes, ''), ?)`, [
                `Rejected inferred contact: ${parsed.data.reason}`,
              ])
            : trx.raw('notes'),
        });

      const aliasesToReject = await trx('contact_aliases')
        .where({
          company_id: companyUUID,
          contact_id: contact.id,
          is_deleted: false,
        })
        .select<ContactAliasRow[]>(
          'id',
          'contact_id',
          'observed_counterparty_id',
          'alias',
          'normalized_alias',
          'is_primary',
        );

      const deletedAliasesCount = await trx('contact_aliases')
        .where({
          company_id: companyUUID,
          contact_id: contact.id,
          is_deleted: false,
        })
        .update({
          is_deleted: true,
          deleted_at: trx.fn.now(),
          deleted_by_id: userId,
          verification_status: 'rejected',
          verified_by_id: userId,
          verified_at: trx.fn.now(),
          updated_by_id: userId,
          updated_at: trx.fn.now(),
        });

      const resetResolutionCount = await trx(
        'bank_transaction_contact_resolutions',
      )
        .where({
          company_id: companyUUID,
          contact_id: contact.id,
          status: 'inferred',
        })
        .update({
          contact_id: null,
          contact_alias_id: null,
          contact_type: null,
          status: 'unresolved',
          source: 'none',
          confidence: null,
          resolution_reason: null,
          resolved_by_id: null,
          resolved_at: null,
          updated_at: trx.fn.now(),
        });

      await writeContactRejectedAudit({
        companyId: companyUUID,
        entityId: contact.id,
        actor: { type: 'user', userId },
        trx,
        context: { source: 'web' },
        payload: {
          previousReviewStatus: contact.review_status,
          nextReviewStatus: 'rejected',
          reason: parsed.data.reason ?? null,
        },
      });
      for (const alias of aliasesToReject) {
        await writeContactAliasRejectedAudit({
          companyId: companyUUID,
          entityId: alias.id,
          actor: { type: 'user', userId },
          trx,
          context: { source: 'web' },
          payload: {
            aliasId: alias.id,
            contactId: contact.id,
            alias: alias.alias,
            action: 'rejected',
          },
        });
      }

      return {
        contactId: contact.id,
        deletedAliasesCount,
        resetResolutionCount,
      };
    });

    return successResponse('Inferred contact rejected', result);
  } catch (error) {
    return errorResponse('Failed to reject inferred contact', error);
  }
}

export async function getContactAliases({
  companyId,
  input,
}: {
  companyId: string;
  input: ContactAliasesQueryInput;
}): Promise<ApiResponse> {
  const parsed = contactAliasesQueryInput.safeParse(input);
  if (!parsed.success) {
    return errorResponse('Invalid input', z.treeifyError(parsed.error), {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  try {
    const result = await knexClient.transaction(async (trx) => {
      const companyUUID = await resolveCompanyUUID(companyId, trx);
      const offset = (parsed.data.page - 1) * parsed.data.limit;
      const baseQuery = trx('contact_aliases as ca')
        .join('contacts as c', 'c.id', 'ca.contact_id')
        .leftJoin(
          'observed_counterparties as oc',
          'oc.id',
          'ca.observed_counterparty_id',
        )
        .where('ca.company_id', companyUUID)
        .where('c.is_deleted', false);

      if (!parsed.data.includeDeleted) {
        baseQuery.where('ca.is_deleted', false);
      }
      if (parsed.data.contactId) {
        baseQuery.where('ca.contact_id', parsed.data.contactId);
      }
      if (parsed.data.observedCounterpartyId) {
        baseQuery.where(
          'ca.observed_counterparty_id',
          parsed.data.observedCounterpartyId,
        );
      }
      if (parsed.data.search) {
        baseQuery.andWhere((qb) => {
          qb.whereILike('ca.alias', `%${parsed.data.search}%`).orWhereILike(
            'ca.normalized_alias',
            `%${parsed.data.search}%`,
          );
        });
      }

      const countRow = await baseQuery
        .clone()
        .clearSelect()
        .clearOrder()
        .count('ca.id as count')
        .first();
      const total = Number(countRow?.count ?? 0);
      const aliases = await baseQuery
        .clone()
        .select(
          'ca.id',
          'ca.alias',
          'ca.normalized_alias as normalizedAlias',
          'ca.source',
          'ca.confidence',
          'ca.verification_status as verificationStatus',
          'ca.verified_by_id as verifiedById',
          'ca.verified_at as verifiedAt',
          'ca.is_primary as isPrimary',
          'ca.is_deleted as isDeleted',
          'ca.created_at as createdAt',
          'ca.updated_at as updatedAt',
          'c.id as contactId',
          'c.display_name as contactName',
          'oc.id as observedCounterpartyId',
          'oc.observed_name as observedName',
        )
        .orderBy('ca.updated_at', 'desc')
        .limit(parsed.data.limit)
        .offset(offset);

      return {
        aliases,
        pagination: {
          currentPage: parsed.data.page,
          pageSize: parsed.data.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / parsed.data.limit)),
          hasNext: offset + aliases.length < total,
          hasPrev: parsed.data.page > 1,
        },
      };
    });

    return successResponse('Contact aliases fetched', result);
  } catch (error) {
    return errorResponse('Failed to fetch contact aliases', error);
  }
}

export async function reassignContactAlias({
  companyId,
  userId,
  aliasId,
  input,
}: {
  companyId: string;
  userId: string;
  aliasId: string;
  input: ReassignContactAliasInput;
}): Promise<ApiResponse> {
  const parsed = reassignContactAliasInput.safeParse(input);
  if (!parsed.success) {
    return errorResponse('Invalid input', z.treeifyError(parsed.error), {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  try {
    const result = await knexClient.transaction(async (trx) => {
      const companyUUID = await resolveCompanyUUID(companyId, trx);
      const alias = await getActiveAlias({
        trx,
        companyId: companyUUID,
        aliasId,
        forUpdate: true,
      });
      const contact = await getActiveContact({
        trx,
        companyId: companyUUID,
        contactId: parsed.data.contactId,
      });

      if (alias.contact_id === contact.id) {
        throw new AppError(
          'Alias already belongs to the selected contact',
          { aliasId: alias.id, contactId: contact.id },
          false,
          ErrorCode.CONFLICT,
        );
      }

      await trx('contact_aliases')
        .where({ id: alias.id, company_id: companyUUID })
        .update({
          is_deleted: true,
          deleted_at: trx.fn.now(),
          deleted_by_id: userId,
          verification_status: 'rejected',
          verified_by_id: userId,
          verified_at: trx.fn.now(),
          updated_by_id: userId,
          updated_at: trx.fn.now(),
        });

      let replacementAlias: ContactAliasRow;
      try {
        [replacementAlias] = await trx('contact_aliases')
          .insert({
            company_id: companyUUID,
            contact_id: contact.id,
            observed_counterparty_id: alias.observed_counterparty_id,
            alias: alias.alias,
            normalized_alias: alias.normalized_alias,
            source: 'user',
            confidence: 1,
            verification_status: 'user_confirmed',
            verified_by_id: userId,
            verified_at: trx.fn.now(),
            is_primary: alias.is_primary,
            created_by_id: userId,
            updated_by_id: userId,
          })
          .returning<ContactAliasRow[]>([
            'id',
            'contact_id',
            'observed_counterparty_id',
            'alias',
            'normalized_alias',
            'is_primary',
          ]);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AppError(
            'An equivalent active alias already exists',
            { alias: alias.alias, contactId: contact.id },
            false,
            ErrorCode.CONFLICT,
          );
        }
        throw error;
      }

      const updatedResolutionCount = await trx(
        'bank_transaction_contact_resolutions',
      )
        .where({
          company_id: companyUUID,
          contact_alias_id: alias.id,
          status: 'inferred',
        })
        .update({
          contact_id: contact.id,
          contact_alias_id: replacementAlias.id,
          status: 'inferred',
          source: 'user',
          confidence: 1,
          resolution_reason: 'User reassigned contact alias',
          resolved_by_id: userId,
          resolved_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      await writeContactAliasReassignedAudit({
        companyId: companyUUID,
        entityId: alias.id,
        actor: { type: 'user', userId },
        trx,
        context: { source: 'web' },
        payload: {
          aliasId: alias.id,
          contactId: contact.id,
          alias: alias.alias,
          previousContactId: alias.contact_id,
          nextContactId: contact.id,
          replacementAliasId: replacementAlias.id,
          action: 'reassigned',
        },
      });
      await writeContactResolutionOverriddenAudit({
        companyId: companyUUID,
        entityId: alias.id,
        actor: { type: 'user', userId },
        trx,
        context: { source: 'web' },
        payload: {
          observedCounterpartyId: alias.observed_counterparty_id,
          contactId: contact.id,
          contactAliasId: replacementAlias.id,
          updatedResolutionCount,
          reason: 'User reassigned contact alias',
        },
      });

      return {
        aliasId: replacementAlias.id,
        previousAliasId: alias.id,
        contactId: contact.id,
        updatedResolutionCount,
      };
    });

    return successResponse('Contact alias reassigned', result);
  } catch (error) {
    return errorResponse('Failed to reassign contact alias', error);
  }
}

export async function deleteContactAlias({
  companyId,
  userId,
  aliasId,
}: {
  companyId: string;
  userId: string;
  aliasId: string;
}): Promise<ApiResponse> {
  try {
    const result = await knexClient.transaction(async (trx) => {
      const companyUUID = await resolveCompanyUUID(companyId, trx);
      const alias = await getActiveAlias({
        trx,
        companyId: companyUUID,
        aliasId,
        forUpdate: true,
      });

      await trx('contact_aliases')
        .where({ id: alias.id, company_id: companyUUID })
        .update({
          is_deleted: true,
          deleted_at: trx.fn.now(),
          deleted_by_id: userId,
          verification_status: 'rejected',
          verified_by_id: userId,
          verified_at: trx.fn.now(),
          updated_by_id: userId,
          updated_at: trx.fn.now(),
        });

      const resetInferredResolutionCount = await trx(
        'bank_transaction_contact_resolutions',
      )
        .where({
          company_id: companyUUID,
          contact_alias_id: alias.id,
          status: 'inferred',
        })
        .update({
          contact_id: null,
          contact_alias_id: null,
          contact_type: null,
          status: 'unresolved',
          source: 'none',
          confidence: null,
          resolution_reason: null,
          resolved_by_id: null,
          resolved_at: null,
          updated_at: trx.fn.now(),
        });

      await writeContactAliasDeletedAudit({
        companyId: companyUUID,
        entityId: alias.id,
        actor: { type: 'user', userId },
        trx,
        context: { source: 'web' },
        payload: {
          aliasId: alias.id,
          contactId: alias.contact_id,
          alias: alias.alias,
          action: 'deleted',
        },
      });

      return {
        aliasId: alias.id,
        resetInferredResolutionCount,
      };
    });

    return successResponse('Contact alias deleted', result);
  } catch (error) {
    return errorResponse('Failed to delete contact alias', error);
  }
}

async function getUnreviewedInferredContacts({
  trx,
  companyId,
  search,
  limit,
}: {
  trx: Knex.Transaction;
  companyId: string;
  search?: string;
  limit: number;
}) {
  const query = trx('contacts as c')
    .leftJoin('contact_aliases as ca', function joinAliases() {
      this.on('ca.contact_id', '=', 'c.id').andOnVal(
        'ca.is_deleted',
        '=',
        false,
      );
    })
    .leftJoin(
      'bank_transaction_contact_resolutions as bcr',
      'bcr.contact_id',
      'c.id',
    )
    .where({
      'c.company_id': companyId,
      'c.created_via': 'system_inferred',
      'c.review_status': 'unreviewed',
      'c.status': 'active',
      'c.is_deleted': false,
    });

  if (search) {
    query.andWhere((qb) => {
      qb.whereILike('c.display_name', `%${search}%`).orWhereILike(
        'c.normalized_name',
        `%${search}%`,
      );
    });
  }

  return query
    .select(
      'c.id',
      'c.display_name as displayName',
      'c.normalized_name as normalizedName',
      'c.created_at as createdAt',
      trx.raw('COUNT(DISTINCT ca.id)::int as "aliasCount"'),
      trx.raw('COUNT(DISTINCT bcr.id)::int as "resolutionCount"'),
      trx.raw('MAX(bcr.confidence)::float as "maxConfidence"'),
    )
    .groupBy('c.id', 'c.display_name', 'c.normalized_name', 'c.created_at')
    .orderBy('c.created_at', 'desc')
    .limit(limit);
}

async function resolveCompanyUUID(
  companyId: string,
  trx: Knex.Transaction,
): Promise<string> {
  const companyUUID = await getCompanyUUID(companyId, trx);
  if (!companyUUID) {
    throw new AppError(
      'Company not found',
      undefined,
      false,
      ErrorCode.NOT_FOUND,
    );
  }
  return companyUUID;
}

async function getObservedCounterparty({
  trx,
  companyId,
  observedCounterpartyId,
}: {
  trx: Knex.Transaction;
  companyId: string;
  observedCounterpartyId: string;
}): Promise<ObservedCounterpartyRow> {
  const observed = await trx('observed_counterparties')
    .where({ id: observedCounterpartyId, company_id: companyId })
    .first<ObservedCounterpartyRow>();
  if (!observed) {
    throw new AppError(
      'Observed counterparty not found',
      undefined,
      false,
      ErrorCode.NOT_FOUND,
    );
  }
  return observed;
}

async function getContact({
  trx,
  companyId,
  contactId,
}: {
  trx: Knex.Transaction;
  companyId: string;
  contactId: string;
}): Promise<ContactRow> {
  const contact = await trx('contacts')
    .where({ id: contactId, company_id: companyId, is_deleted: false })
    .first<ContactRow>('id', 'display_name', 'created_via', 'review_status');
  if (!contact) {
    throw new AppError(
      'Contact not found',
      undefined,
      false,
      ErrorCode.NOT_FOUND,
    );
  }
  return contact;
}

async function getActiveContact(args: {
  trx: Knex.Transaction;
  companyId: string;
  contactId: string;
}): Promise<ContactRow> {
  const contact = await getContact(args);
  const active = await args
    .trx('contacts')
    .where({
      id: args.contactId,
      company_id: args.companyId,
      status: 'active',
      is_deleted: false,
    })
    .first('id');
  if (!active) {
    throw new AppError(
      'Active contact not found',
      undefined,
      false,
      ErrorCode.NOT_FOUND,
    );
  }
  return contact;
}

async function findResolutionForReview({
  trx,
  companyId,
  resolutionId,
  bankTransactionId,
}: {
  trx: Knex.Transaction;
  companyId: string;
  resolutionId?: string;
  bankTransactionId?: string;
}): Promise<ResolutionRow> {
  const query = trx('bank_transaction_contact_resolutions')
    .where('company_id', companyId)
    .select<
      ResolutionRow[]
    >('id', 'bank_transaction_id', 'observed_counterparty_id', 'contact_id', 'contact_alias_id', 'status');

  if (resolutionId) {
    query.where('id', resolutionId);
  } else {
    query.where('bank_transaction_id', bankTransactionId);
  }

  const resolution = await query.first();
  if (!resolution) {
    throw new AppError(
      'Contact resolution not found',
      undefined,
      false,
      ErrorCode.NOT_FOUND,
    );
  }
  return resolution;
}

async function upsertAliasForContact({
  trx,
  companyId,
  userId,
  contactId,
  observedCounterpartyId,
  alias,
  allowExistingForSameContact,
}: {
  trx: Knex.Transaction;
  companyId: string;
  userId: string;
  contactId: string;
  observedCounterpartyId: string | null;
  alias: string;
  allowExistingForSameContact: boolean;
}): Promise<ContactAliasRow> {
  const cleanAlias = alias.trim();
  const normalizedAlias = normalizeContactName(cleanAlias);
  if (!normalizedAlias) {
    throw new AppError(
      'Alias cannot be empty after normalization',
      undefined,
      false,
      ErrorCode.INVALID_INPUT,
    );
  }

  const [inserted] = await trx('contact_aliases')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      observed_counterparty_id: observedCounterpartyId,
      alias: cleanAlias,
      normalized_alias: normalizedAlias,
      source: 'user',
      confidence: 1,
      verification_status: 'user_confirmed',
      verified_by_id: userId,
      verified_at: trx.fn.now(),
      is_primary: false,
      created_by_id: userId,
      updated_by_id: userId,
    })
    .onConflict(
      trx.raw('(company_id, normalized_alias) WHERE is_deleted = false'),
    )
    .ignore()
    .returning<ContactAliasRow[]>(['id', 'contact_id']);

  if (inserted) {
    await writeContactAliasCreatedAudit({
      companyId,
      entityId: inserted.id,
      actor: { type: 'user', userId },
      trx,
      context: { source: 'web' },
      payload: {
        aliasId: inserted.id,
        contactId,
        alias: cleanAlias,
        action: 'created',
      },
    });
    return inserted;
  }

  const existing = await trx('contact_aliases')
    .where({
      company_id: companyId,
      normalized_alias: normalizedAlias,
      is_deleted: false,
    })
    .whereNot('verification_status', 'rejected')
    .forUpdate()
    .first<ContactAliasRow>(
      'id',
      'contact_id',
      'observed_counterparty_id',
      'alias',
      'normalized_alias',
      'is_primary',
    );

  if (!existing) {
    throw new AppError(
      'Alias could not be created',
      undefined,
      false,
      ErrorCode.DATABASE_ERROR,
    );
  }

  if (existing.contact_id !== contactId || !allowExistingForSameContact) {
    throw new AppError(
      'Alias already belongs to another contact',
      { alias: cleanAlias },
      false,
      ErrorCode.CONFLICT,
    );
  }

  if (observedCounterpartyId) {
    await trx('contact_aliases')
      .where({ id: existing.id, company_id: companyId })
      .whereNull('observed_counterparty_id')
      .update({
        observed_counterparty_id: observedCounterpartyId,
        updated_by_id: userId,
        updated_at: trx.fn.now(),
      });
  }

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
    context: { source: 'web' },
    payload: {
      aliasId: existing.id,
      contactId,
      alias: cleanAlias,
      action: 'confirmed',
    },
  });

  return existing;
}

async function getActiveAlias({
  trx,
  companyId,
  aliasId,
  forUpdate = false,
}: {
  trx: Knex.Transaction;
  companyId: string;
  aliasId: string;
  forUpdate?: boolean;
}): Promise<ContactAliasRow> {
  const query = trx('contact_aliases')
    .where({
      id: aliasId,
      company_id: companyId,
      is_deleted: false,
    })
    .whereNot('verification_status', 'rejected')
    .select(
      'id',
      'contact_id',
      'observed_counterparty_id',
      'alias',
      'normalized_alias',
      'is_primary',
    );
  if (forUpdate) query.forUpdate();

  const alias = await query.first<ContactAliasRow>();
  if (!alias) {
    throw new AppError(
      'Contact alias not found',
      undefined,
      false,
      ErrorCode.NOT_FOUND,
    );
  }
  return alias;
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

async function confirmContactIfUnreviewed({
  trx,
  companyId,
  userId,
  contactId,
}: {
  trx: Knex.Transaction;
  companyId: string;
  userId: string;
  contactId: string;
}) {
  await trx('contacts')
    .where({
      id: contactId,
      company_id: companyId,
      review_status: 'unreviewed',
      is_deleted: false,
    })
    .update({
      review_status: 'confirmed',
      reviewed_by_id: userId,
      reviewed_at: trx.fn.now(),
      updated_by_id: userId,
      updated_at: trx.fn.now(),
    });
}

async function updateResolutionsForObserved({
  trx,
  companyId,
  userId,
  observedCounterpartyId,
  fallbackResolutionId,
  contactId,
  contactAliasId,
  status,
  reason,
}: {
  trx: Knex.Transaction;
  companyId: string;
  userId: string;
  observedCounterpartyId: string | null;
  fallbackResolutionId: string | null;
  contactId: string;
  contactAliasId: string | null;
  status: Extract<ResolutionReviewStatus, 'confirmed' | 'manual_override'>;
  reason: string;
}): Promise<number> {
  const query = trx('bank_transaction_contact_resolutions')
    .where('company_id', companyId)
    .whereIn('status', ['unresolved', 'ambiguous', 'inferred'])
    .andWhere((qb) => {
      qb.whereNull('contact_id').orWhere('contact_id', contactId);
    });

  if (observedCounterpartyId) {
    query.where('observed_counterparty_id', observedCounterpartyId);
  } else if (fallbackResolutionId) {
    query.where('id', fallbackResolutionId);
  } else {
    return 0;
  }

  return query.update({
    contact_id: contactId,
    contact_alias_id: contactAliasId,
    contact_type: null,
    status,
    source: 'user',
    confidence: 1,
    resolution_reason: reason,
    resolved_by_id: userId,
    resolved_at: trx.fn.now(),
    updated_at: trx.fn.now(),
  });
}
