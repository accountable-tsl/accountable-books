import knex from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";

export async function getAllCurrencies(): Promise<ApiResponse> {
  try {
    const currencies = await knex("currencies")
      .select("id", "code", "name", "symbol")
      .where("is_deleted", false);
    if (currencies.length === 0) errorResponse("No currencies found");

    return successResponse(
      `Successfully retrieved ${currencies.length} currencies`,
      currencies
    );
  } catch (error) {
    return errorResponse("An unexpected error occurred", error);
  }
}
