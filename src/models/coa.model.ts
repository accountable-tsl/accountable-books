import knexInstance from "../../knexClient";
import type { Knex } from "knex";
import { errorResponse, successResponse } from "../utils/utils";

import { CoaTemplateName, newCoa, NewCoa } from "../types/db.type";
import { NODE_ENV } from "../config/env";
import { ApiResponse } from "../types/generic";

export const createCoa = async (
  knex: Knex,
  input: NewCoa[]
): Promise<ApiResponse> => {
  const validatedInput = newCoa.array().safeParse(input);

  if (!validatedInput.success) {
    return errorResponse(
      "Invalid input provided",
      validatedInput.error.flatten()
    );
  }

  if (validatedInput.data.length === 0) {
    return errorResponse("No data provided for creating chart of accounts");
  }

  try {
    const insertedRecords = await knex.transaction(async (trx) => {
      const inserted = await trx("coa")
        .insert(validatedInput.data)
        .returning("*");
      return inserted;
    });

    if (!insertedRecords || insertedRecords.length === 0) {
      return errorResponse("Failed to insert any chart of accounts records");
    }
    return successResponse(
      "Chart of accounts created successfully",
      insertedRecords
    );
  } catch (error) {
    return errorResponse("Failed to create chart of accounts", error);
  }
};

function normalizeTemplateName(name: string): string {
  const parts = name.split(":");
  if (parts.length === 3) {
    // Shorthand: ind::basic::v1 → ind:none:basic:none:v1
    return `${parts[0]}:none:${parts[1]}:none:${parts[2]}`;
  }
  return name; // Explicit form
}
