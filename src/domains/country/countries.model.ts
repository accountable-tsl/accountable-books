import { knexClient } from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import { snakeToCamel } from "../../shared/utils/formatting.utils";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";

export async function getCountries(): Promise<ApiResponse> {
  try {
    const countries = await knexClient("countries")
      .select("id", "code", "name", "phone_code", "flag", "continent")
      .where("is_deleted", false)
      .orderBy("name", "asc");

    return successResponse(
      `${countries.length} countries fetched successfully`,
      snakeToCamel(countries)
    );
  } catch (error) {
    return errorResponse("Error fetching country list", error);
  }
}
