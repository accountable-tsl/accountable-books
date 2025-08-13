import type { Knex } from "knex";
import {
  loadCoaTemplate,
  type LoadCoaTemplateInput,
  newCoaTemplate,
  type NewCoaTemplateInput,
  type SelectBestCoa,
} from "./coaTemplate.type.js";
import type { ApiResponse } from "../../core/types/api.types.js";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils.js";
import { type Company } from "../companies/companies.types.js";
import { selectBestCoaTemplate } from "./coaTemplateSelector.service.js";
import { createDefaultAccounts } from "./coa.model.js";
import { type NewCoa } from "./coa.types.js";

export const addNewCoaTemplates = async (
  knex: Knex,
  input: NewCoaTemplateInput[],
): Promise<ApiResponse> => {
  const validatedInput = newCoaTemplate
    .array()
    .nonempty("At least one template required")
    .safeParse(input);
  if (!validatedInput.success) {
    return errorResponse(
      "Invalid input provided",
      validatedInput.error.flatten(),
    );
  }

  try {
    const insertedRecords = await knex.transaction(async (trx) => {
      const inserted = await trx("coa_templates")
        .insert(validatedInput.data)
        .returning("*");
      return inserted;
    });

    if (!insertedRecords || insertedRecords.length === 0) {
      return errorResponse("Failed to insert any coa template records");
    }

    return successResponse(
      `coa template(s) with ${insertedRecords.length} records entered successfully`,
      insertedRecords,
    );
  } catch (error) {
    return errorResponse("Error inserting coa template(s)", error);
  }
};

export const loadCoaTemplateForCompany = async (
  knex: Knex,
  input: LoadCoaTemplateInput,
): Promise<ApiResponse> => {
  // Validate Input
  const validatedInput = loadCoaTemplate.safeParse(input);
  if (!validatedInput.success)
    return errorResponse("Invalid Input", validatedInput.error.flatten());

  const { companyId, template_name, use_code, additional_info } =
    validatedInput.data;

  try {
    // Fetch company
    const [company]: Partial<Company[]> = await knex("companies")
      .where("id", companyId)
      .select(
        "display_name",
        "type",
        "industry",
        "website",
        "reporting_framework",
        "reporting_currency_id",
      );

    if (!company || !company.type || !company.reporting_currency_id)
      return errorResponse("Company not found or missing required fields");

    let chosenTemplate;
    if (template_name) {
      // If user provided a template name, use that
      chosenTemplate = template_name;
    }

    // If no template name provided, try to determine best template
    if (!chosenTemplate) {
      const matchInput: SelectBestCoa = {
        company,
        use_code,
        additional_info,
      };
      const { template } = await selectBestCoaTemplate(knex, matchInput);
      chosenTemplate = template;
    }

    // Check if template is valid and select valid template
    const validTemplate: NewCoa[] = await knex("coa_templates")
      .where("is_active", true)
      .where("template_name", chosenTemplate)
      .select("code", "name", "description", "account_type_id", "locked");

    if (!validTemplate || !validTemplate.length) {
      // No valid template could be found? Attempt to create default accounts
      await createDefaultAccounts(
        knex,
        companyId,
        input.created_by_id,
        company.reporting_currency_id,
      );

      return successResponse(
        `No valid template found. Default accounts created for ${company.display_name}`,
        null,
      );
    }

    return knex.transaction(async (trx) => {
      const templateToInsert: NewCoa[] = validTemplate.map((t) => {
        return {
          code: t.code,
          name: t.name,
          account_type_id: t.account_type_id,
          description: t.description,
          is_active: true,
          currency_id: company.reporting_currency_id,
          company_id: companyId,
          created_by_id: input.created_by_id,
          locked: t.locked,
          source: "template",
        };
      });

      await trx("coa").insert(templateToInsert);

      return successResponse(
        `Coa template with ${validTemplate.length} lines inserted for ${company.display_name}`,
        chosenTemplate,
      );
    });
  } catch (error) {
    return errorResponse("Failed to load and insert coa template", error);
  }
};
