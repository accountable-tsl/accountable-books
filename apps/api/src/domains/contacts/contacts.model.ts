import type { Knex } from 'knex';
import z from 'zod';

import { knexClient } from '../../db/knexClient.js';
import { logFlowStep } from '../../shared/telemetry/log-flow-step.js';
import { logger } from '../../shared/utils/logger.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { normalizeContactName } from './contact-normalization.utils.js';
import {
  writeContactCreatedAudit,
  writeContactDeletedAudit,
  writeContactUpdatedAudit,
} from './contacts.audit.js';
import {
  contactInputSchema,
  deleteContactInput,
  getContactsParams,
  updateContactSchema,
} from './contacts.types.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type {
  ContactCreatedVia,
  ContactInput,
  ContactResponse,
  DeleteContactInput,
  GetContactsParams,
  UpdateContact,
} from './contacts.types.js';

/**
 * Sanitizes contact input data by trimming whitespace and normalizing text fields
 */
function sanitizeContactInput(contact: ContactInput): ContactInput {
  const optionalText = (value?: string) => value?.trim() || undefined;

  return {
    ...contact,
    displayName: contact.displayName.trim(),
    email: optionalText(contact.email)?.toLowerCase(),
    address: optionalText(contact.address),
    notes: optionalText(contact.notes),
  };
}

export async function addNewContacts({
  input,
  companyId,
  userId,
  createdVia = 'manual',
  trx,
}: {
  input: ContactInput[];
  companyId: string;
  userId: string;
  createdVia?: Extract<ContactCreatedVia, 'manual' | 'import' | 'integration'>;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<ContactResponse['contacts']>> {
  const startTime = Date.now();
  const operationId = `add-contacts-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const inputArray = Array.isArray(input) ? input : [input];

  const contactsLogger = logger.child({
    operation: 'addNewContacts',
    operationId,
    companyId,
    userId,
    contactCount: inputArray.length,
  });

  contactsLogger.info('Starting contact creation');

  // Input validation with detailed error context
  const validate = contactInputSchema.array().safeParse(inputArray);
  if (!validate.success) {
    const validationError = 'Invalid contact input provided';
    contactsLogger.warn(
      {
        validationErrors: z.treeifyError(validate.error),
        inputCount: inputArray.length,
      },
      validationError,
    );
    return errorResponse(validationError, z.treeifyError(validate.error));
  }

  // Convert validated snake_case data to camelCase and sanitize
  const camelCaseContacts: ContactInput[] = validate.data.map((contact) => ({
    id: contact.id,
    displayName: contact.display_name,
    email: contact.email,
    address: contact.address,
    status: contact.status,
    notes: contact.notes,
  }));

  const sanitizedContacts = camelCaseContacts.map(sanitizeContactInput);
  contactsLogger.debug(
    { sanitizedCount: sanitizedContacts.length },
    'Contact input sanitized',
  );

  const query = async (tx: Knex.Transaction) => {
    try {
      const companyUUID = await getCompanyUUID(companyId, tx);

      if (!companyUUID) {
        const companyError = `Company not found: ${companyId}`;
        contactsLogger.error({ companyId }, companyError);
        throw new Error(companyError);
      }

      contactsLogger.debug({ companyUUID }, 'Company resolved successfully');

      contactsLogger.debug(
        {
          names: sanitizedContacts.map((c) => c.displayName),
        },
        'Contacts prepared for creation',
      );

      // Create data structure for insertion
      const data = sanitizedContacts.map((contact) => ({
        ...(contact.id && { id: contact.id }),
        display_name: contact.displayName,
        email: contact.email,
        address: contact.address,
        notes: contact.notes,
        status: contact.status,
        normalized_name: normalizeContactName(contact.displayName),
        created_via: createdVia,
        review_status: 'confirmed',
        reviewed_by_id: userId,
        reviewed_at: tx.fn.now(),
        company_id: companyUUID,
        created_by_id: userId,
        updated_by_id: userId,
      }));

      const result = await tx('contacts')
        .insert(data)
        .returning([
          'id',
          'display_name as displayName',
          'address',
          'email',
          'status',
          'created_via as createdVia',
          'review_status as reviewStatus',
          'notes',
          'created_at as createdAt',
          'updated_at as updatedAt',
        ]);

      for (const contact of result) {
        await writeContactCreatedAudit({
          companyId: companyUUID,
          entityId: contact.id,
          actor: { type: 'user', userId },
          trx: tx,
          context: { source: createdVia === 'import' ? 'import' : 'web' },
          payload: {
            displayName: contact.displayName,
            createdVia: contact.createdVia,
            reviewStatus: contact.reviewStatus,
          },
        });
      }

      contactsLogger.info(
        {
          createdCount: result.length,
          contactIds: result.map((c) => c.id),
        },
        'Contacts created successfully',
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      contactsLogger.error(
        {
          error: error instanceof Error ? error : new Error(String(error)),
          operationId,
        },
        `Contact creation failed: ${errorMessage}`,
      );

      throw error;
    }
  };
  // Execute within transaction context
  try {
    const result = trx ? await query(trx) : await knexClient.transaction(query);

    logFlowStep({
      flow: 'contacts',
      step: 'add_contacts',
      status: 'ok',
      durationMs: Date.now() - startTime,
      contactCount: result.length,
    });

    const message =
      result.length === 1
        ? 'Contact created successfully'
        : `${result.length} contacts created successfully`;
    contactsLogger.info(
      {
        createdCount: result.length,
        duration: Date.now() - startTime,
      },
      'Contact creation operation completed successfully',
    );

    return successResponse(message, result);
  } catch (error: any) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    contactsLogger.error(
      {
        error: error instanceof Error ? error : new Error(String(error)),
        operationId,
        duration: Date.now() - startTime,
        contactCount: sanitizedContacts.length,
      },
      'Contact creation operation failed',
    );

    if (error.message?.startsWith('Company not found')) {
      return errorResponse('Invalid company identifier', error);
    }

    return errorResponse(
      'Failed to create contact(s). Please try again.',
      error,
    );
  }
}

export async function getContacts(
  input: GetContactsParams,
): Promise<ApiResponse<ContactResponse>> {
  // Input validation
  const parseInput = getContactsParams.safeParse(input);
  if (!parseInput.success) {
    return errorResponse(
      'Invalid request parameters',
      z.treeifyError(parseInput.error),
    );
  }

  const {
    companyId,
    ids,
    displayNames,
    emails,
    page,
    limit,
    search,
    status,
    createdVia,
    reviewStatus,
    sortBy,
    sortOrder,
    trx,
  } = parseInput.data;

  const normalizedSearch = search?.trim().toLowerCase();

  const query = async (tx: Knex.Transaction) => {
    const companyUUID = await getCompanyUUID(companyId, tx);
    if (!companyUUID) {
      return errorResponse('Company not found');
    }

    let baseQuery = tx('contacts as c')
      .where('c.company_id', companyUUID)
      .where('c.is_deleted', false);

    if (ids?.length) {
      baseQuery = baseQuery.whereIn('c.id', ids);
    }

    if (displayNames?.length) {
      baseQuery = baseQuery.whereIn('c.display_name', displayNames);
    }

    if (emails?.length) {
      baseQuery = baseQuery.whereIn('c.email', emails);
    }

    if (status) {
      baseQuery = baseQuery.andWhere('c.status', status);
    } else {
      baseQuery = baseQuery.andWhere('c.status', 'active');
    }

    if (createdVia) {
      baseQuery = baseQuery.andWhere('c.created_via', createdVia);
    }

    if (reviewStatus) {
      baseQuery = baseQuery.andWhere('c.review_status', reviewStatus);
    }

    // Apply search
    if (normalizedSearch) {
      baseQuery = baseQuery.andWhere((qb) => {
        qb.whereRaw('c.search_text ILIKE ?', [
          `%${normalizedSearch}%`,
        ]).orWhereRaw('c.search_text % ?', [normalizedSearch]);
      });
    }

    // Get total count for pagination
    const countResult = await baseQuery.clone().count('* as count').first();
    const total = Number(countResult?.count ?? 0);

    // Calculate pagination
    const offset = Math.max(0, (page - 1) * limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Validate page bounds
    if (page > totalPages) {
      return errorResponse(
        `Page ${page} exceeds maximum pages (${totalPages})`,
      );
    }

    const defaultSortCol = 'c.display_name';
    const resolvedSortBy = sortBy ? `c.${sortBy}` : defaultSortCol;

    const selectFields = [
      'c.id',
      'c.display_name as displayName',
      'c.address',
      'c.email',
      'c.status',
      'c.created_via as createdVia',
      'c.review_status as reviewStatus',
      'c.notes',
      'c.created_at as createdAt',
      'c.updated_at as updatedAt',
      ...(normalizedSearch
        ? [tx.raw('similarity(c.search_text, ?) as rank', [normalizedSearch])]
        : []),
    ];

    const contacts = await baseQuery
      .select(selectFields)
      .orderBy(
        ...(normalizedSearch
          ? (['rank', 'desc'] as const)
          : ([resolvedSortBy, sortOrder ?? 'asc'] as const)),
      )
      .limit(limit)
      .offset(offset);

    const pagination = {
      currentPage: page,
      pageSize: limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };

    if (total === 0 && page === 1) {
      return successResponse('No contacts found', {
        contacts: [],
        pagination: {
          ...pagination,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    return successResponse('Contacts fetched successfully', {
      contacts,
      pagination,
    });
  };

  try {
    const result = trx ? await query(trx) : await knexClient.transaction(query);
    return result as ApiResponse<ContactResponse>;
  } catch (error: any) {
    return errorResponse(`Failed to fetch contacts`, error);
  }
}

export async function updateContacts({
  updates,
  companyId,
  userId,
  trx,
}: {
  updates: UpdateContact[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}) {
  const validate = updateContactSchema.array().safeParse(updates);
  if (!validate.success) {
    return errorResponse('Invalid input', z.treeifyError(validate.error));
  }

  const query = async (tx: Knex.Transaction) => {
    const companyUUID = await getCompanyUUID(companyId, tx);

    // Verify all contacts exist
    const contactIds = validate.data.map((c) => c.id);
    const existingContacts = await tx('contacts')
      .whereIn('id', contactIds)
      .andWhere('company_id', companyUUID)
      .andWhere('is_deleted', false)
      .select('id', 'display_name', 'email', 'address', 'status', 'notes');

    if (existingContacts.length !== contactIds.length) {
      const missingIds = contactIds.filter(
        (id) => !existingContacts.some((c) => c.id === id),
      );
      throw new Error(
        `Contact(s) with these IDs do not exist: ${missingIds.join(', ')}`,
      );
    }

    // Prepare update data with normalized names
    const updateData = validate.data.map((contact) => {
      const data: any = {
        id: contact.id,
        updated_by_id: userId,
        updated_at: tx.fn.now(),
      };

      // Only include fields that are explicitly provided
      if (contact.display_name !== undefined) {
        data.display_name = contact.display_name;
        data.normalized_name = normalizeContactName(contact.display_name);
      }
      if (contact.address !== undefined) data.address = contact.address;
      if (contact.email !== undefined) data.email = contact.email;
      if (contact.notes !== undefined) data.notes = contact.notes;
      if (contact.status !== undefined) data.status = contact.status;

      return data;
    });

    const updatePromises = updateData.map(async (data) => {
      const { id, ...updateFields } = data;
      const [updatedContact] = await tx('contacts')
        .where({ id, company_id: companyUUID, is_deleted: false })
        .update(updateFields)
        .returning([
          'id',
          'display_name as displayName',
          'address',
          'email',
          'status',
          'created_via as createdVia',
          'review_status as reviewStatus',
          'notes',
        ]);
      return updatedContact;
    });

    const updatedContacts = await Promise.all(updatePromises);

    for (const contact of validate.data) {
      const previousContact = existingContacts.find(
        (existingContact) => existingContact.id === contact.id,
      );
      const changedFields: Record<
        string,
        { previous: unknown | null; next: unknown | null }
      > = {};
      const addChange = (field: string, previous: unknown, next: unknown) => {
        if (next !== undefined && previous !== next) {
          changedFields[field] = {
            previous: previous ?? null,
            next: next ?? null,
          };
        }
      };

      addChange(
        'displayName',
        previousContact?.display_name,
        contact.display_name,
      );
      addChange('email', previousContact?.email, contact.email);
      addChange('address', previousContact?.address, contact.address);
      addChange('status', previousContact?.status, contact.status);
      addChange('notes', previousContact?.notes, contact.notes);

      if (Object.keys(changedFields).length > 0) {
        await writeContactUpdatedAudit({
          companyId: companyUUID!,
          entityId: contact.id,
          actor: { type: 'user', userId },
          trx: tx,
          context: { source: 'web' },
          payload: { changedFields },
        });
      }
    }

    return updatedContacts;
  };

  try {
    const result = trx ? await query(trx) : await knexClient.transaction(query);
    return successResponse('Contacts updated successfully', result);
  } catch (error: any) {
    if (error.message?.startsWith('Contact(s) with these IDs')) {
      return errorResponse(error.message);
    }
    return errorResponse('Failed to update contacts', error);
  }
}

export async function deleteContact({
  input,
  companyId,
  userId,
}: {
  input: DeleteContactInput;
  companyId: string;
  userId: string;
}) {
  const validate = deleteContactInput.safeParse(input);
  if (!validate.success) {
    return errorResponse('Invalid input', z.treeifyError(validate.error), {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  try {
    const result = await knexClient.transaction(async (tx) => {
      const companyUUID = await getCompanyUUID(companyId, tx);
      if (!companyUUID) {
        throw new Error('Company not found');
      }

      const contact = await tx('contacts')
        .where({
          id: validate.data.id,
          company_id: companyUUID,
          is_deleted: false,
        })
        .first('id', 'display_name');
      if (!contact) {
        return errorResponse('Contact not found', undefined, {
          code: ErrorCode.NOT_FOUND,
        });
      }

      const referenceCounts = await getContactReferenceCounts({
        trx: tx,
        companyId: companyUUID,
        contactId: validate.data.id,
      });
      const totalReferences = Object.values(referenceCounts).reduce(
        (sum, count) => sum + count,
        0,
      );

      if (totalReferences > 0) {
        return errorResponse(
          'Contact is linked to transaction, accounting, or resolution records and cannot be deleted. Archive it instead.',
          { referenceCounts },
          { code: ErrorCode.OPERATION_NOT_ALLOWED },
        );
      }

      await tx('contacts')
        .where({ id: validate.data.id, company_id: companyUUID })
        .update({
          status: 'archived',
          is_deleted: true,
          deleted_at: tx.fn.now(),
          deleted_by_id: userId,
          updated_by_id: userId,
          updated_at: tx.fn.now(),
        });

      await writeContactDeletedAudit({
        companyId: companyUUID,
        entityId: validate.data.id,
        actor: { type: 'user', userId },
        trx: tx,
        context: { source: 'web' },
        payload: {
          displayName: contact.display_name ?? null,
        },
      });

      return successResponse('Contact deleted successfully', {
        contactId: validate.data.id,
      });
    });

    return result;
  } catch (error) {
    return errorResponse('Failed to delete contact', error);
  }
}

async function getContactReferenceCounts({
  trx,
  companyId,
  contactId,
}: {
  trx: Knex.Transaction;
  companyId: string;
  contactId: string;
}): Promise<Record<string, number>> {
  const countTable = async (
    table: string,
    extraWhere: Record<string, unknown> = {},
  ) => {
    const row = await trx(table)
      .where({ company_id: companyId, contact_id: contactId, ...extraWhere })
      .count('* as count')
      .first();
    return Number(row?.count ?? 0);
  };
  const countLedgerEntries = async () => {
    const row = await trx('ledger_entries as le')
      .join('ledger_transactions as lt', 'lt.id', 'le.ledger_transaction_id')
      .where({
        'lt.company_id': companyId,
        'lt.status': 'posted',
        'le.contact_id': contactId,
      })
      .count('* as count')
      .first();
    return Number(row?.count ?? 0);
  };
  const countCategorizationCandidateLines = async () => {
    const row = await trx('categorization_candidate_lines as ccl')
      .join('categorization_candidates as cc', 'cc.id', 'ccl.candidate_id')
      .where({
        'cc.company_id': companyId,
        'ccl.contact_id': contactId,
      })
      .count('* as count')
      .first();
    return Number(row?.count ?? 0);
  };
  const countCategorizationPredictionLines = async () => {
    const row = await trx('categorization_prediction_lines as cpl')
      .join('categorization_predictions as cp', 'cp.id', 'cpl.prediction_id')
      .where({
        'cp.company_id': companyId,
        'cpl.contact_id': contactId,
      })
      .count('* as count')
      .first();
    return Number(row?.count ?? 0);
  };

  return {
    projects: await countTable('projects'),
    contactTypeAssignments: await countTable('contact_type_assignments'),
    ledgerTransactions: await countTable('ledger_transactions', {
      status: 'posted',
    }),
    ledgerEntries: await countLedgerEntries(),
    categorizationCandidates: await countTable('categorization_candidates'),
    categorizationCandidateLines: await countCategorizationCandidateLines(),
    categorizationPredictions: await countTable('categorization_predictions'),
    categorizationPredictionLines: await countCategorizationPredictionLines(),
    // Contact resolution retired (v1) — counts for dropped tables disabled.
    // bankTransactionContactResolutions: await countTable(
    //   'bank_transaction_contact_resolutions',
    // ),
    // contactAliases: await countTable('contact_aliases'),
    recurringJournalTemplates: await countTable('recurring_journal_templates'),
    journalBatches: await countTable('journal_batches'),
    bankTransactionContactStats: await countTable(
      'bank_transaction_contact_stats',
    ),
    bankTransactionContactStatsEntries: await countTable(
      'bank_transaction_contact_stats_entries',
    ),
    contactStatsReplays: await countTable('contact_stats_replays'),
  };
}
