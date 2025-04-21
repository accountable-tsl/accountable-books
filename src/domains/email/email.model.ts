import { z } from "zod";
import { ApiResponse } from "../../core/types/api.types";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import type { Knex } from "knex";

const purposes = {
  signup: {
    ifExists: "This email is already registered",
    ifNotExists: "Email is available",
  },
  resetPassword: {
    ifExists: "If this email exists, instructions will be sent",
    ifNotExists: "If this email exists, instructions will be sent", // same to prevent leakage
  },
  verifyEmail: {
    ifExists: "Verification link sent if email exists",
    ifNotExists: "Verification link sent if email exists",
  },
};
export async function checkEmail(
  knex: Knex,
  email?: string,
  purpose?: keyof typeof purposes
): Promise<ApiResponse> {
  try {
    const isValidEmailFormat = z.string().email().safeParse(email);

    if (!isValidEmailFormat.success) {
      return errorResponse("Invalid email format", isValidEmailFormat.error);
    }

    const user = await knex("user").where({ email }).first();

    const messages = purpose
      ? purposes[purpose]
      : {
          ifExists: "Email exists",
          ifNotExists: "Email not found",
        };

    const message = user ? messages.ifExists : messages.ifNotExists;

    if (user && purpose === "signup") {
      return errorResponse(message, email);
    }

    return successResponse(message, purpose === "signup" ? email : null);
  } catch (error) {
    return errorResponse("Error verifying email", error);
  }
}
