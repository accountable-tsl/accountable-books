import type { Knex } from 'knex';
import z from 'zod';

import type { ApiResponse } from '../../core/types/api.types.js';
import { knexClient } from '../../db/knexClient.js';
import {
  logDatabaseOperation,
  logError,
  logger,
  logTiming,
} from '../../shared/utils/logger.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import {
  createHybridSearch,
  defineSearchableColumns,
} from '../../shared/utils/search.utils.js';
import type {
  ContactInput,
  ContactResponse,
  GetContactsParams,
  UpdateContact,
} from './contacts.types.js';
import {
  contactInputSchema,
  getContactsParams,
  updateContactSchema,
} from './contacts.types.js';

export const normalizeContactName = (name: string) => name.trim().toLowerCase();

/**
 * Sanitizes contact input data by trimming whitespace and normalizing text fields
 */
function sanitizeContactInput(contact: ContactInput): ContactInput {
  return {
    ...contact,
    displayName: contact.displayName.trim(),
    email: contact.email?.trim().toLowerCase(),
    address: contact.address?.trim(),
    notes: contact.notes?.trim(),
  };
}

export async function addNewContacts({
  input,
  companyId,
  userId,
  trx,
}: {
  input: ContactInput[];
  companyId: string;
  userId: string;
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
      // Get company's UUID with logging
      logDatabaseOperation('SELECT', 'companies', { companyId });
      const companyUUID = await getCompanyUUID(companyId, tx);

      if (!companyUUID) {
        const companyError = `Company not found: ${companyId}`;
        contactsLogger.error({ companyId }, companyError);
        throw new Error(companyError);
      }

      contactsLogger.debug({ companyUUID }, 'Company resolved successfully');

      // Normalize names to verify uniqueness
      const normalizedNames = sanitizedContacts.map((c) =>
        normalizeContactName(c.displayName),
      );
      contactsLogger.debug(
        {
          names: sanitizedContacts.map((c) => c.displayName),
          normalizedNames,
        },
        'Contact names normalized for duplicate check',
      );

      // Check for existing contacts
      logDatabaseOperation('SELECT', 'contacts', {
        companyId: companyUUID,
        nameCount: normalizedNames.length,
      });
      const existingContacts: { display_name: string }[] = await tx('contacts')
        .whereIn('normalized_name', normalizedNames)
        .andWhere('company_id', companyUUID)
        .select('display_name');

      if (existingContacts.length > 0) {
        const existingNames = existingContacts.map((c) => c.display_name);
        const duplicateError = `Contact(s) with these names already exist: ${existingNames.join(', ')}`;
        contactsLogger.warn(
          {
            existingNames,
            attemptedNames: sanitizedContacts.map((c) => c.displayName),
          },
          'Duplicate contact names detected',
        );
        throw new Error(duplicateError);
      }

      contactsLogger.debug(
        'No duplicate contacts found, proceeding with creation',
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
        company_id: companyUUID,
        created_by_id: userId,
        updated_by_id: userId,
      }));

      // Insert contacts with logging
      logDatabaseOperation('INSERT', 'contacts', {
        companyId: companyUUID,
        contactCount: data.length,
        names: data.map((c) => c.display_name),
      });
      const result = await tx('contacts')
        .insert(data)
        .returning([
          'id',
          'display_name as displayName',
          'address',
          'email',
          'status',
          'notes',
          'created_at as createdAt',
          'updated_at as updatedAt',
        ]);

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

      logError(error instanceof Error ? error : new Error(String(error)), {
        operation: 'addNewContacts',
        companyId,
        userId,
        operationId,
        contactCount: sanitizedContacts.length,
      });

      throw error;
    }
  };
  // Execute within transaction context
  try {
    const result = trx ? await query(trx) : await knexClient.transaction(query);

    logTiming('addNewContacts', startTime, {
      contactCount: result.length,
      companyId,
      operationId,
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

    // Handle specific error types with appropriate responses
    if (error.message?.startsWith('Contact(s) with these names')) {
      return errorResponse(String(error.message), error);
    }

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
    page,
    limit,
    search,
    status,
    sortBy,
    sortOrder,
    trx,
  } = parseInput.data;

  const searchableColumns = defineSearchableColumns('c', [
    { column: 'display_name', name: 'displayName', weight: 2.0 },
    { column: 'email', weight: 1.5 },
    { column: 'address' },
    { column: 'notes', weight: 0.8 },
  ]);

  const { applySearchFilter, rankFields, rankOrder } = createHybridSearch({
    search,
    searchableColumns,
    trx,
    options: {
      minSimilarityThreshold: 0.25,
      fuzzyMinLength: 2,
    },
  });

  const query = async (tx: Knex.Transaction) => {
    const companyUUID = await getCompanyUUID(companyId, tx);
    if (!companyUUID) {
      return errorResponse('Company not found');
    }

    let baseQuery = tx('contacts as c')
      .where('c.company_id', companyUUID)
      .andWhere('c.is_deleted', false);

    if (ids?.length) {
      baseQuery = baseQuery.whereIn('c.id', ids);
    }

    if (displayNames?.length) {
      baseQuery = baseQuery.whereIn('c.display_name', displayNames);
    }

    if (status) {
      baseQuery = baseQuery.andWhere('c.status', status);
    }

    // Apply search
    if (search?.trim()) baseQuery = applySearchFilter(baseQuery);

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
      'c.notes',
      'c.created_at as createdAt',
      'c.updated_at as updatedAt',
      ...rankFields,
    ];

    const contacts = await baseQuery
      .select(selectFields)
      .orderBy(...(rankOrder ?? [resolvedSortBy, sortOrder ?? 'asc']))
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
      .select('id');

    if (existingContacts.length !== contactIds.length) {
      const missingIds = contactIds.filter(
        (id) => !existingContacts.some((c) => c.id === id),
      );
      throw new Error(
        `Contact(s) with these IDs do not exist: ${missingIds.join(', ')}`,
      );
    }

    // Check for display name uniqueness if any updates include display names
    const displayNamesToUpdate = validate.data
      .filter(
        (c) =>
          typeof c.display_name === 'string' && c.display_name.trim() !== '',
      )
      .map((c) => c.display_name as string);

    if (displayNamesToUpdate.length > 0) {
      const normalizedNamesToUpdate =
        displayNamesToUpdate.map(normalizeContactName);

      // Check for duplicates within the batch itself
      const duplicatesInBatch = normalizedNamesToUpdate.filter(
        (name, index, arr) => arr.indexOf(name) !== index,
      );
      if (duplicatesInBatch.length > 0) {
        throw new Error(
          `Duplicate names found in update batch: ${duplicatesInBatch.join(', ')}`,
        );
      }

      // Check for conflicts with existing contacts (excluding those being updated)
      const duplicateContacts = await tx('contacts')
        .where('company_id', companyUUID)
        .whereIn('normalized_name', normalizedNamesToUpdate)
        .whereNotIn('id', contactIds) // Exclude contacts being updated
        .select('display_name');

      if (duplicateContacts.length > 0) {
        const duplicateNames = duplicateContacts.map((c) => c.display_name);
        throw new Error(
          `Contact(s) with these names already exist: ${duplicateNames.join(', ')}`,
        );
      }
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
        .where({ id, company_id: companyUUID })
        .update(updateFields)
        .returning([
          'id',
          'display_name as displayName',
          'address',
          'email',
          'status',
          'notes',
        ]);
      return updatedContact;
    });

    const updatedContacts = await Promise.all(updatePromises);
    return updatedContacts;
  };

  try {
    const result = trx ? await query(trx) : await knexClient.transaction(query);
    return successResponse('Contacts updated successfully', result);
  } catch (error: any) {
    if (error.message?.startsWith('Contact(s) with these names')) {
      return errorResponse(error.message);
    }
    if (error.message?.startsWith('Contact(s) with these IDs')) {
      return errorResponse(error.message);
    }
    return errorResponse('Failed to update contacts', error);
  }
}
