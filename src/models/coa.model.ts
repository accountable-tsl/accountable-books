import knexInstance from "../../knexClient";
import type { Knex } from "knex";
import { errorResponse, successResponse } from "../utils/utils";

import {
  CoaTemplateName,
  newCoa,
  NewCoa,
} from "../types/db.type";
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

export const loadCoaTemplate = async (
  knexTrx: Knex.Transaction,
  input: LoadCoaTemplateForCompany
) => {
  const validatedInput = loadCoaTemplateForCompany.safeParse(input);
  if (!validatedInput.success) {
    return errorResponse("Invalid input", validatedInput.error.flatten());
  }

  const company = await knexTrx("company")
    .select("industry", "type", "reporting_currency_id")
    .where({ id: validatedInput.data.company_id })
    .first();
  if (!company) return errorResponse("Unauthorized");

  let defaultCoa: NewCoa[] = [];
  let template_name: CoaTemplateName;

  // CASE 1: Explicit template requested (highest priority)
  if (validatedInput.data.template_name) {
    template_name = validatedInput.data.template_name;
  }
  // CASE 2: Individual user
  else if (company.type === "individual") {
    template_name = await determineIndividualTemplate(
      company,
      input.additionalInfo
    );
  }
  // CASE 3: Accounting firm
  else if (company.type === "accounting_firm") {
    template_name = await determineAccountingFirmTemplate(company);
  }
  // CASE 4: Business (default case)
  else {
    template_name = await determineBusinessTemplate(company, input);
  }

  // if (company.type === "individual") {
  //   template_name = "personal:basic";
  // }
  // if (company.type === "business" && validatedInput.data.template_name) {
  //   template_name = validatedInput.data.template_name;
  // }

  // if (!template_name) {
  //   template_name = getMatchingCoaTemplate(
  //     [input.description, input.industry].filter(Boolean).join(", ")
  //   );
  // }

  if (company.type !== "individual") {
    const suffix = company.prefersCode === false ? "" : "_wcode";
    template_name = `${template_name}${suffix}` as CoaTemplateName;
  }

  const retrievedCoa = await knexTrx("coa_template")
    .select("code", "name", "description", "account_type_id")
    .where({
      template_name,
    });

  defaultCoa = retrievedCoa.map((coa) => {
    return {
      ...coa,
      company_id: validatedInput.data.company_id,
      created_by_id: validatedInput.data.created_by_id,
      currency_id: company.reporting_currency_id,
      is_active: true,
    };
  });
  if (!defaultCoa.length) {
    return errorResponse("Unable to retrieve coa template");
  }

  const insertedCoa = await knexTrx("coa").insert(defaultCoa);
  if (!insertedCoa.length) {
    return errorResponse("Unable to insert coa template");
  }

  return successResponse(
    `Chart of accounts template [${template_name.toUpperCase()}, ${defaultCoa.length} entries] loaded`,
    insertedCoa
  );
};

