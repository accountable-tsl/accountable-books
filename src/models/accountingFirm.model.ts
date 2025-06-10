import type { Knex } from "knex";
import {
  newAccountingFirm,
  NewAccountingFirmInput,
} from "../core/types/db.types";
import { ApiResponse } from "../core/types/api.types";
import { errorResponse, successResponse } from "../shared/utils/response.utils";

export const createFirm = async (
  knex: Knex,
  input: NewAccountingFirmInput
): Promise<ApiResponse> => {
  const validateInput = newAccountingFirm.safeParse(input);
  if (!validateInput.success) {
    return errorResponse("Invalid input", validateInput.error.flatten());
  }

  const { data } = validateInput;

  try {
    const [newFirm] = await knex
      .insert({
        ...data,
        display_name: data.display_name || data.legal_name,
      })
      .returning("*");

    if (!newFirm.id) return errorResponse("Failed to create firm");

    return successResponse("Accounting firm successfully created", newFirm);
  } catch (error) {
    return errorResponse("Unknown error occured", error);
  }
};
