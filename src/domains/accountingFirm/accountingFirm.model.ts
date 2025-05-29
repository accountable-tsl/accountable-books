import type { Knex } from "knex";
import { ApiResponse } from "../../core/types/api.types";
import {
  AccFirm,
  AccFirmWithId,
  NewAccFirm,
  newAccFirm,
} from "./accountingFirm.types";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";

export const resolveFirm = async (
  trx: Knex.Transaction,
  firmId?: string
): Promise<string> => {
  if (firmId) {
    const [verifyFirm] = await trx("accounting_firms")
      .where("id", firmId)
      .select("id");

    if (verifyFirm) {
      return verifyFirm.id;
    }
  }

  const platformFirm = await trx("accounting_firms as af")
    .join("companies as c", "af.company_id", "c.id")
    .where("c.is_platform", true)
    .select("af.id");

  if (!platformFirm || platformFirm.length > 1) {
    throw new Error("Unable to resolve firm to assign");
  }
  return platformFirm[0].id;
};

export const createAccountingFirm = async (
  knexTrx: Knex,
  input: NewAccFirm
): Promise<ApiResponse<AccFirmWithId>> => {
  const validatedInput = newAccFirm.safeParse(input);

  if (!validatedInput.success) {
    return errorResponse("Invalid input", validatedInput.error.flatten());
  }
  const { data } = validatedInput;

  try {
    const [newFirm] = await knexTrx("accounting_firms")
      .insert(data)
      .returning("*");

    if (!newFirm) return errorResponse("Failed to create firm");
    const { company_id: id, ...rest } = newFirm;

    return successResponse("Accounting firm successfully created", {
      id,
      ...rest,
    });
  } catch (error) {
    return errorResponse("Unknown error occured", error);
  }
};
