import type { Knex } from 'knex';
import type { ApiResponse } from '../../core/types/api.types.js';
import { snakeToCamel } from '../../shared/utils/formatting.utils.js';
import {
  type CreateUserResponse,
  type NewUserDirect,
  newUserDirect,
  type UserResponseCamel,
} from '../../domains/users/users.types.js';
import { errorResponse, successResponse } from '../../shared/utils/response.utils.js';
import { generateRandomToken, hashPassword, hashToken } from '../../shared/utils/crypto.utils.js';
import dayjs from 'dayjs';
import { knexClient } from '../../db/knexClient.js';
import { addNewToken } from '../tokens/tokens.model.js';
import { createInitialUserOnboardingState } from '../../features/onboarding/onboarding.utils.js';
import { logger, logError, logDatabaseOperation, logTiming } from '../../shared/utils/logger.js';

/**
 * Options for creating a user directly
 */
export interface CreateUserDirectOptions {
  /** User creation data */
  input: NewUserDirect;
  /** Database transaction context (required) */
  transaction: Knex.Transaction;
}

/**
 * Creates a new user account directly with full transaction safety.
 *
 * This function handles:
 * - Input validation and sanitization
 * - Atomic database operations within provided transaction
 * - Duplicate email checking
 * - Password hashing with crypto-secure methods
 * - Email verification token generation
 * - Complete audit logging
 *
 * @param options - User creation options with named parameters
 * @returns ApiResponse with user creation result
 */
export async function createUserDirect(
  options: CreateUserDirectOptions,
): Promise<ApiResponse<CreateUserResponse>> {
  const { input, transaction: trx } = options;
  const startTime = Date.now();
  const operationId = `create-user-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  const isDemo = input.is_demo_user || false;
  const userLogger = logger.child({
    operation: 'createUserDirect',
    operationId,
    email: input.email,
    isDemo: input.is_demo_user || false,
  });

  !isDemo && userLogger.info('Starting user creation');

  // Input validation and sanitization
  const validateInput = newUserDirect.safeParse(input);
  if (!validateInput.success) {
    const validationError = 'Invalid input provided for user creation';
    !isDemo &&
      userLogger.warn(
        {
          validationErrors: validateInput.error.format(),
        },
        validationError,
      );
    if (isDemo) {
      throw new Error(validationError);
    }
    return errorResponse(validationError, validateInput.error.format());
  }

  const { email, password, ...rest } = validateInput.data;

  // Password requirement check
  if (!password) {
    const passwordError = 'Password is required for user creation';
    !isDemo && userLogger.warn(passwordError);
    if (isDemo) {
      throw new Error(passwordError);
    }
    return errorResponse(passwordError);
  }

  // Email sanitization (trim and lowercase)
  const sanitizedEmail = email.trim().toLowerCase();

  // Execute user creation within the provided transaction
  try {
    !isDemo && logDatabaseOperation('SELECT', 'users', { email: sanitizedEmail });

    // Check for existing user
    const existingUser = await trx('users')
      .select(['id', 'firstname', 'lastname', 'email', 'onboarding_state'])
      .where({ email: sanitizedEmail })
      .first();

    if (existingUser) {
      if (isDemo) {
        return successResponse('User with this email already exists', {
          id: existingUser.id,
          firstname: existingUser.firstname,
          lastname: existingUser.lastname,
          email: sanitizedEmail,
          onboardingState: existingUser.onboarding_state,
          verificationToken: '',
        });
      }

      const duplicateError = 'User with this email already exists';
      !isDemo && userLogger.warn({ userId: existingUser.id }, duplicateError);
      return errorResponse(duplicateError);
    }

    !isDemo && userLogger.debug('No existing user found, proceeding with creation');

    // Generate tokens and hash password concurrently
    const [verificationToken, hashedPassword] = await Promise.all([
      generateRandomToken(),
      hashPassword(password),
    ]);

    const onboardingState = createInitialUserOnboardingState();

    // Insert user
    !isDemo && logDatabaseOperation('INSERT', 'users', { email: sanitizedEmail });
    const [user] = await trx('users')
      .insert({
        ...rest,

        email: sanitizedEmail,
        password: hashedPassword,
        onboarding_state: onboardingState,
      })
      .returning(['id', 'firstname', 'lastname', 'email', 'onboarding_state']);

    if (!user?.id) {
      const insertError = 'Failed to create user record - no user returned';
      !isDemo && userLogger.error(insertError);
      throw new Error(insertError);
    }

    !isDemo && userLogger.info({ userId: user.id }, 'User record created successfully');

    // Create verification token
    const hashedVerificationToken = await hashToken(verificationToken);

    !isDemo &&
      logDatabaseOperation('INSERT', 'tokens', {
        userId: user.id,
        tokenType: 'email_verification',
      });

    await addNewToken(
      {
        user_id: user.id,
        token_hash: hashedVerificationToken,
        expires_at: dayjs().add(24, 'hours').toDate(),
        token_type: 'email_verification',
      },
      trx,
    );

    !isDemo && userLogger.info({ userId: user.id }, 'Email verification token created');

    const response: CreateUserResponse = {
      id: user.id,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      onboardingState: user.onboarding_state || onboardingState,
      verificationToken,
    };

    !isDemo &&
      logTiming('createUserDirect', startTime, {
        userId: user.id,
        operationId,
      });

    !isDemo && userLogger.info({ userId: user.id }, 'User creation completed successfully');
    return successResponse('Account created successfully', response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    !isDemo &&
      userLogger.error(
        {
          error: error instanceof Error ? error : new Error(String(error)),
          operationId,
        },
        `User creation failed: ${errorMessage}`,
      );

    !isDemo &&
      logError(error instanceof Error ? error : new Error(String(error)), {
        operation: 'createUserDirect',
        email: sanitizedEmail,
        operationId,
      });

    return errorResponse(
      "We couldn't create your account. Please try again.",
      process.env.NODE_ENV === 'production' ? undefined : error,
    );
  }
}

export async function getUserDetails(userId: string): Promise<ApiResponse<UserResponseCamel>> {
  try {
    const user = await knexClient('users').select('*').where({ id: userId }).first();

    if (!user) {
      return errorResponse('User not found');
    }

    const { password, ...rest } = user;
    const result = snakeToCamel(rest) as UserResponseCamel;

    return successResponse('User details found', result);
  } catch (error) {
    return errorResponse('Error getting user details', error);
  }
}

// export async function createUserInvite(
//   knex: Knex,
//   invitedBy: { email: string; organizationId: string },
//   input: NewUserInvite[]
// ): Promise<ApiResponse> {
//   const saltRounds = 10;
//   const now = new Date();
//   const expiry = dayjs(now).add(7, "day").toDate();

//   const errors: Array<{ email: string; message: string }> = [];
//   const validInvites: NewUserInvite[] = [];
//   const inviteTokens: Array<{ email: string; token: string }> = [];

//   const [invitedByUser, invitedByOrg] = await Promise.all([
//     await knex("users")
//       .select("id", "firstname", "email")
//       .where({ email: invitedBy.email })
//       .first(),

//     await knex("organization")
//       .select("id", "name")
//       .where({ id: invitedBy.organizationId })
//       .orWhere({ shortCode: invitedBy.organizationId })
//       .first(),
//   ]);

//   if (!invitedByUser || !invitedByOrg) {
//     return errorResponse("Bad Request");
//   }

//   await Promise.all(
//     input.map(async (invite) => {
//       const result = newUserInvite.safeParse({
//         ...camelToSnake(invite),
//         status: "invited",
//         invite_status: "pending",
//         invited_at: new Date(),
//         invite_expiry: expiry,
//       });

//       if (!result.success) {
//         errors.push({
//           email: invite.email,
//           message: `Validation failed: ${result.error.errors.map((e) => e.message).join(", ")}`,
//         });
//         return;
//       }
//       validInvites.push(result.data);
//     })
//   );

//   if (!validInvites.length) {
//     return errorResponse("No valid invitations to process", errors);
//   }

//   try {
//     return await knexInstance.transaction(async (trx) => {
//       // Check existing users in single query
//       const existingEmails = new Set(
//         await trx("users")
//           .select("email")
//           .whereIn(
//             "email",
//             validInvites.map((i) => i.email)
//           )
//           .pluck("email")
//       );

//       const successfulInvites = [];

//       for (const invite of validInvites) {
//         if (existingEmails.has(invite.email)) {
//           errors.push({
//             email: invite.email,
//             message: "User already exists",
//           });
//           continue;
//         }

//         const rawToken = crypto.randomBytes(32).toString("hex");
//         const hashedToken = await bcrypt.hash(rawToken, saltRounds);

//         const [created] = await trx("users")
//           .insert({
//             ...invite,
//             invite_token_hash: hashedToken,
//             password_hash: null,
//           })
//           .returning(["id", "email", "invite_expiry_date"]);

//         successfulInvites.push(created);
//         inviteTokens.push({
//           email: invite.email,
//           token: rawToken,
//         });
//       }

//       // Send all emails after successful DB operations
//       await Promise.all(
//         inviteTokens.map(async (tokenObj) => {
//           const url = buildEmailServiceUrl("accept-invite", {
//             token: tokenObj.token,
//           });

//           await sendUserInviteEmail({
//             to: tokenObj.email,
//             name: tokenObj.email,
//             url,
//             invitedByUser: invitedByUser,
//             invitedByOrg: invitedByOrg,
//           });
//         })
//       );

//       return successResponse(
//         `Invites processed: ${successfulInvites.length} successful, ${errors.length} failed`,
//         {
//           successful: snakeToCamel(successfulInvites),
//           errors: errors.length ? errors : undefined,
//         }
//       );
//     });
//   } catch (error) {
//     return errorResponse(
//       "Failed to process invitations. Please try again later.",
//       { error: "systemerror: unknown" }
//     );
//   }
// }
