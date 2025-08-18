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

export async function createUserDirect(
  knexTrx: Knex.Transaction,
  input: NewUserDirect,
): Promise<ApiResponse<CreateUserResponse>> {
  const validateInput = newUserDirect.safeParse(input);
  if (!validateInput.success) {
    return errorResponse('Invalid input', validateInput.error.format());
  }
  const { email, password, ...rest } = validateInput.data;
  if (!password) {
    return errorResponse('Password is required');
  }

  try {
    const existingUser = await knexTrx('users').select('id').where({ email }).first();

    if (existingUser) {
      return errorResponse('User with this email already exists');
    }

    const [verificationToken, hashedPassword] = await Promise.all([
      generateRandomToken(),
      hashPassword(password),
    ]);

    const onboardingState = createInitialUserOnboardingState();

    const [user] = await knexTrx('users')
      .insert({
        ...rest,
        email,
        password: hashedPassword,
        onboarding_state: onboardingState,
      })
      .returning(['id', 'firstname', 'lastname', 'email', 'onboarding_state']);

    if (!user) {
      return errorResponse("We couldn't create your account. Please try again.");
    }

    const hashedVerificationToken = await hashToken(verificationToken);
    await addNewToken(
      {
        user_id: user.id,
        token_hash: hashedVerificationToken,
        expires_at: dayjs().add(24, 'hours').toDate(),
        token_type: 'email_verification',
      },
      knexTrx,
    );

    const resp: CreateUserResponse = {
      id: user.id,
      email: user.email,
      firstname: user.firstname,
      lastname: user?.lastname,
      onboardingState: user.onboarding_state || onboardingState,
      verificationToken,
    };

    return successResponse('Account created successfully', resp);
  } catch (error) {
    return errorResponse("We couldn't create your account. Please try again.", error);
  }
}

export async function getUserDetails(userId: string): Promise<ApiResponse<UserResponseCamel>> {
  try {
    const user = await knexClient('users').select('*').where({ id: userId }).first();

    if (!user) {
      return errorResponse('User not found');
    }

    const { password, ...rest } = user;
    const result = snakeToCamel(rest);

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
//       { error: "system_error" }
//     );
//   }
// }
