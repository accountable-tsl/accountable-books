import type { Knex } from "knex";
import { newToken, NewToken } from "./tokens.types";
import { knexClient } from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";

export async function addNewToken(
  input: NewToken,
  trx?: Knex.Transaction
): Promise<ApiResponse> {
  const knex = trx || knexClient;

  const validInput = newToken.safeParse(input);
  if (!validInput.success) {
    return errorResponse("Invalid input provided", validInput.error.flatten());
  }

  const { token_type, user_id, invitation_id } = validInput.data;

  try {
    // Check if there is an existing active token
    const existingToken = await knex("tokens")
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
      .andWhere("consumed_at", null)
      .andWhere("expires_at", ">", knex.fn.now())
      .first();

    let result;
    const isUpdate = !!existingToken;

    if (existingToken) {
      // If found, update the existing token
      result = await knex("tokens")
        .where({ id: existingToken.id })
        .update({
          token_hash: validInput.data.token_hash,
          expires_at: validInput.data.expires_at,
          updated_at: new Date(),
        })
        .returning("*");
    } else {
      // If not found, insert a new token
      result = await knex("tokens").insert(validInput.data).returning("*");
    }
    if (!result.length) return errorResponse("Failed to save token");
    const { token_hash, ...rest } = result[0];
    return successResponse(
      isUpdate
        ? "Found and updated existing token"
        : "Token created successfully",
      rest
    );
  } catch (error) {
    return errorResponse("Failed to save token", error);
  }
}
