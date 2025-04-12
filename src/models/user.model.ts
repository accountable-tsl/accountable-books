import {
  newUserDirect,
  NewUserDirect,
  newUserInvite,
  NewUserInvite,
} from "../types/db.type";
import bcrypt from "bcrypt";
import dayjs from "dayjs";
import crypto from "crypto";
import knexInstance from "../../knexClient";
import { hashPassword } from "../lib/bcrypt";
import { ApiResponse } from "../types/generic";
import {
  camelToSnake,
  errorResponse,
  generateRandomToken,
  hashToken,
  snakeToCamel,
  successResponse,
} from "../utils/utils";
import {
  buildEmailServiceUrl,
  sendUserInviteEmail,
  sendVerificationEmail,
} from "../services/email.service";
import { ENV } from "../config/env";
import type { Knex } from "knex";

export async function createUserDirect(
  knexTrx: Knex.Transaction,
  input: NewUserDirect
): Promise<ApiResponse> {
  const snakeInput = camelToSnake(input);
  const validateInput = newUserDirect.safeParse(snakeInput);

  if (!validateInput.success) {
    return errorResponse("Invalid input", validateInput.error.format());
  }

  const { email } = validateInput.data;

  try {
    const existingUser = await knexTrx("user")
      .select("id")
      .where({ email })
      .first();

    if (existingUser) {
      return errorResponse("User with this email already exists");
    }

    const [verificationToken, hashedPassword] = await Promise.all([
      generateRandomToken(),
      hashPassword(input.password),
    ]);

    const { password, ...rest } = validateInput.data;

    const [user] = await knexTrx("user")
      .insert({
        ...rest,
        password_hash: hashedPassword,
        email_verified: false,
        status: "active",
        email_verification_token_hash: hashToken(verificationToken),
        email_verification_expiry: dayjs().add(24, "hours").toDate(),
      })
      .returning(["id", "firstname", "lastname", "email", "status"]);

    const url = buildEmailServiceUrl("verify-email", {
      token: verificationToken,
    });
    //   await sendWelcomeEmail(user.email, user.firstname, verifyUrl); // Send this almost immediately
    await sendVerificationEmail({
      to: user.email,
      name: user.firstname,
      url,
    }).catch((error) => {
      console.error(error);
    });

    return successResponse("Account created successfully", snakeToCamel(user));
    // });
  } catch (error) {
    return errorResponse(
      "We couldn't create your account. Please try again.",
      error
    );
  }
}

export async function createUserInvite(
  invitedBy: { email: string; organizationId: string },
  input: NewUserInvite[]
): Promise<ApiResponse> {
  const saltRounds = 10;
  const now = new Date();
  const expiry = dayjs(now).add(7, "day").toDate();

  const errors: Array<{ email: string; message: string }> = [];
  const validInvites: NewUserInvite[] = [];
  const inviteTokens: Array<{ email: string; token: string }> = [];

  const [invitedByUser, invitedByOrg] = await Promise.all([
    await knexInstance("user")
      .select("id", "firstname", "email")
      .where({ email: invitedBy.email })
      .first(),

    await knexInstance("organization")
      .select("id", "name")
      .where({ id: invitedBy.organizationId })
      .orWhere({ shortCode: invitedBy.organizationId })
      .first(),
  ]);

  if (!invitedByUser || !invitedByOrg) {
    return errorResponse("Bad Request");
  }

  await Promise.all(
    input.map(async (invite) => {
      const result = newUserInvite.safeParse({
        ...camelToSnake(invite),
        status: "invited",
        invite_status: "pending",
        invited_at: new Date(),
        invite_expiry: expiry,
      });

      if (!result.success) {
        errors.push({
          email: invite.email,
          message: `Validation failed: ${result.error.errors.map((e) => e.message).join(", ")}`,
        });
        return;
      }
      validInvites.push(result.data);
    })
  );

  if (!validInvites.length) {
    return errorResponse("No valid invitations to process", errors);
  }

  try {
    return await knexInstance.transaction(async (trx) => {
      // Check existing users in single query
      const existingEmails = new Set(
        await trx("users")
          .select("email")
          .whereIn(
            "email",
            validInvites.map((i) => i.email)
          )
          .pluck("email")
      );

      const successfulInvites = [];

      for (const invite of validInvites) {
        if (existingEmails.has(invite.email)) {
          errors.push({
            email: invite.email,
            message: "User already exists",
          });
          continue;
        }

        const rawToken = crypto.randomBytes(32).toString("hex");
        const hashedToken = await bcrypt.hash(rawToken, saltRounds);

        const [created] = await trx("users")
          .insert({
            ...invite,
            invite_token_hash: hashedToken,
            password_hash: null,
          })
          .returning(["id", "email", "invite_expiry_date"]);

        successfulInvites.push(created);
        inviteTokens.push({
          email: invite.email,
          token: rawToken,
        });
      }

      // Send all emails after successful DB operations
      await Promise.all(
        inviteTokens.map(async (tokenObj) => {
          const url = buildEmailServiceUrl("accept-invite", {
            token: tokenObj.token,
          });

          await sendUserInviteEmail({
            to: tokenObj.email,
            name: tokenObj.email,
            url,
            invitedByUser: invitedByUser,
            invitedByOrg: invitedByOrg,
          });
        })
      );

      return successResponse(
        `Invites processed: ${successfulInvites.length} successful, ${errors.length} failed`,
        {
          successful: snakeToCamel(successfulInvites),
          errors: errors.length ? errors : undefined,
        }
      );
    });
  } catch (error) {
    return errorResponse(
      "Failed to process invitations. Please try again later.",
      { error: "system_error" }
    );
  }
}
