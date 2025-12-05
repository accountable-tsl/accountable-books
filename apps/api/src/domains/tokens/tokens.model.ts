import type { Knex } from 'knex';

import type { ApiResponse } from '../../core/types/api.types.js';
import { knexClient } from '../../db/knexClient.js';
import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import {
  type AddNewTokenResponse,
  type FetchTokenResponse,
  type GetInvitedUserTokenInput,
  type GetTokenInput,
  type NewToken,
  newToken,
} from './tokens.types.js';

export async function addNewToken(
  input: NewToken,
  trx?: Knex.Transaction,
): Promise<ApiResponse<AddNewTokenResponse>> {
  const knex = trx || knexClient;

  const validInput = newToken.safeParse(input);
  if (!validInput.success) {
    return errorResponse('Invalid input provided', validInput.error.flatten());
  }

  const { token_type, user_id, invitation_id } = validInput.data;

  try {
    // Check if there is an existing active token
    const existingToken = await knex('tokens')
      .where({
        token_type,
      })
      .andWhere((qb) => {
        if (user_id) {
          qb.where({ user_id });
        } else if (invitation_id) {
          qb.where({ invitation_id });
        }
      })
      .andWhere('consumed_at', null)
      .andWhere('expires_at', '>', knex.fn.now())
      .first();

    let result;
    const isUpdate = !!existingToken;

    if (existingToken) {
      // If found, update the existing token
      result = await knex('tokens')
        .where({ id: existingToken.id })
        .update({
          token_hash: validInput.data.token_hash,
          expires_at: validInput.data.expires_at,
          updated_at: new Date(),
        })
        .returning('*');
    } else {
      // If not found, insert a new token
      result = await knex('tokens').insert(validInput.data).returning('*');
    }
    if (!result.length) return errorResponse('Failed to save token');
    const { token_hash, ...rest } = result[0];
    return successResponse(
      isUpdate
        ? 'Found and updated existing token'
        : 'Token created successfully',
      rest,
    );
  } catch (error) {
    return errorResponse('Failed to save token', error);
  }
}

export async function getUserToken({
  userId,
  email,
  companyId,
  tokenType,
  includeExpired = false,
  includeEmailAddress = false,
  trx,
}: GetTokenInput & { trx?: Knex.Transaction }): Promise<
  ApiResponse<FetchTokenResponse>
> {
  const knex = trx || knexClient;

  // Validation
  if (!tokenType) return errorResponse('Token type is required');
  if (!userId && !email && !companyId) {
    return errorResponse('Must provide userId, userEmail, or companyId');
  }
  if (userId && email) {
    return errorResponse('Cannot specify both userId and userEmail');
  }

  try {
    const query = knex('tokens')
      .where({ token_type: tokenType })
      .orderBy('created_at', 'desc');

    if (!includeExpired) query.andWhere('expires_at', '>', knex.fn.now());

    // Handle email joins
    if (includeEmailAddress || email) {
      query
        .leftJoin('users', 'tokens.user_id', 'users.id')
        .select('tokens.*', 'users.email');

      if (email) {
        query.andWhere('users.email', email);
      }
    } else {
      query.select('tokens.*');
    }

    const token = await query.first();
    return successResponse('Token retrieved', token || null);
  } catch (error) {
    return errorResponse('Error fetching token', error);
  }
}

export async function getTokenForInvitedUser({
  invitationId,
  email,
  tokenType,
  includeExpired = false,
  trx,
}: GetInvitedUserTokenInput & {
  trx?: Knex.Transaction;
}): Promise<ApiResponse<FetchTokenResponse>> {
  const knex = trx || knexClient;

  // Validation
  if (!tokenType) return errorResponse('Token type is required');
  if (!invitationId) return errorResponse('Invitation ID is required');

  try {
    const query = knex('tokens')
      .where({
        token_type: tokenType,
        invitation_id: invitationId,
      })
      .orderBy('created_at', 'desc');

    if (!includeExpired) {
      query.andWhere('expires_at', '>', knex.fn.now());
    }

    // Always include email for invitation tokens
    query
      .leftJoin(
        'user_invitations',
        'tokens.invitation_id',
        'user_invitations.id',
      )
      .select('tokens.*', 'user_invitations.email');

    // Filter by email if provided
    if (email) {
      query.andWhere('user_invitations.email', email);
    }

    const token = await query.first();
    return successResponse('Invitation token retrieved', token || null);
  } catch (error) {
    console.error('Error fetching invitation token:', error);
    return errorResponse('Failed to retrieve invitation token');
  }
}
