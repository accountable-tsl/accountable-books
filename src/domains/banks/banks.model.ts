import knexClient from "../../../knexClient";
import { camelToSnake } from "../../shared/utils/formatting.utils";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { newBank, NewInput } from "./banks.types";

export async function addNewBank(
  data: NewInput | NewInput[],
  knexInstance = knexClient
) {
  // Normalize input to an array
  const bankData = Array.isArray(data) ? data : [data];
  const banks = camelToSnake(bankData);

  // Validate all entries
  const validatedData = newBank.array().safeParse(banks);

  if (!validatedData.success) {
    return errorResponse(
      `Invalid input provided: ${validatedData.error.message}`,
      validatedData.error.flatten()
    );
  }
  try {
    const inserted = await knexInstance("banks")
      .insert(validatedData.data)
      .returning("id");

    if (!inserted || inserted.length === 0) {
      return errorResponse("No banks were inserted");
    }
    return successResponse(
      `${inserted.length} bank(s) added successfully`,
      inserted
    );
  } catch (error) {
    return errorResponse("Failed to add new bank", error);
  }
}
