import type { Knex } from "knex";
import { ApiResponse } from "../../core/types/api.types";
import { NewAccFirm, newAccFirm } from "./accountingFirm.types";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";

export const resolveFirm = async (trx: Knex.Transaction, firmId?: string) => {
  if (firmId) {
    const [verifyFirm] = await trx("accounting_firm")
      .where("id", firmId)
      .select("id");

    if (verifyFirm) {
      return verifyFirm.id;
    }
  }

  const platformFirm = await trx("accounting_firm")
    .where("is_platform_firm", true)
    .select("id");

  if (!platformFirm || platformFirm.length > 1) {
    throw new Error("Unable to resolve firm to assign");
  }
  return platformFirm[0].id;
};

export const createAccountingFirm = async (
  knexTrx: Knex,
  input: NewAccFirm
): Promise<ApiResponse> => {
  const validatedInput = newAccFirm.safeParse(input);

  if (!validatedInput.success) {
    return errorResponse("Invalid input", validatedInput.error.flatten());
  }
  const { data } = validatedInput;

  try {
    const [newFirm] = await knexTrx("accounting_firm")
      .insert({
        ...data,
        display_name: data.display_name || data.legal_name,
      })
      .returning("*");

    if (!newFirm || !newFirm.id) return errorResponse("Failed to create firm");

    return successResponse("Accounting firm successfully created", newFirm);
  } catch (error) {
    return errorResponse("Unknown error occured", error);
  }
};
