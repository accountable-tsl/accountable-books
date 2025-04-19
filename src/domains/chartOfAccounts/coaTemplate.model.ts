import type { Knex } from "knex";
import {
  loadCoaTemplate,
  LoadCoaTemplateInput,
  newCoaTemplate,
  NewCoaTemplateInput,
  SelectBestCoa,
} from "./coaTemplate.type";
import { ApiResponse } from "../../core/types/api.types";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { Company } from "../company/company.types";
import { selectBestCoaTemplate } from "./coaTemplateSelector.service";

export const addNewCoaTemplates = async (
  knex: Knex,
  input: NewCoaTemplateInput[]
): Promise<ApiResponse> => {
  const validatedInput = newCoaTemplate
    .array()
    .nonempty("At least one template required")
    .safeParse(input);
  if (!validatedInput.success) {
    return errorResponse(
      "Invalid input provided",
      validatedInput.error.flatten()
    );
  }

  try {
    const insertedRecords = await knex.transaction(async (trx) => {
      const inserted = await trx("coa_template")
        .insert(validatedInput.data)
        .returning("*");
      return inserted;
    });

    if (!insertedRecords || insertedRecords.length === 0) {
      return errorResponse("Failed to insert any coa template records");
    }

    return successResponse(
      `coa template(s) with ${insertedRecords.length} records entered successfully`,
      insertedRecords
    );
  } catch (error) {
    return errorResponse("Error inserting coa template(s)", error);
  }
};

export const loadCoaTemplateForCompany = async (
  knex: Knex,
  input: LoadCoaTemplateInput
): Promise<ApiResponse> => {
  // Validate Input
  const validatedInput = loadCoaTemplate.safeParse(input);
  if (!validatedInput.success)
    return errorResponse("Invalid Input", validatedInput.error.flatten());

  const { companyId, template_name, use_code, additional_info } =
    validatedInput.data;

  try {
    // Fetch company
    const [company]: Partial<Company[]> = await knex("company")
      .where("id", companyId)
      .select(
        "display_name",
        "type",
        "industry",
        "website",
        "reporting_framework",
        "reporting_currency_id"
      );

    if (!company || !company.type || !company.reporting_currency_id)
      return errorResponse("Company not found or invalid type");

    let chosenTemplate;
    if (template_name) {
      chosenTemplate = template_name;
    }

    if (!chosenTemplate) {
      const matchInput: SelectBestCoa = {
        company,
        use_code,
        additional_info,
      };
      const { template } = await selectBestCoaTemplate(knex, matchInput);
      chosenTemplate = template;
    }

    const validTemplate = await knex("coa_template")
      .where("is_active", true)
      .where("template_name", chosenTemplate)
      .select("code", "name", "description", "account_type_id");

    if (!validTemplate.length) {
      return errorResponse(`Template ${chosenTemplate} is invalid or inactive`);
    }

    return knex.transaction(async (trx) => {
      const templateToInsert = validTemplate.map((t) => {
        return {
          code: t.code,
          name: t.name,
          account_type_id: t.account_type_id,
          description: t.description,
          is_active: true,
          currency_id: company.reporting_currency_id,
          company_id: companyId,
          created_by_id: input.created_by_id,
        };
      });

      const insertedCoa = await trx("coa").insert(templateToInsert);

      return successResponse(
        `Coa template with ${validTemplate.length} lines inserted for ${company.display_name}`,
        chosenTemplate
      );
    });
  } catch (error) {
    return errorResponse("Failed to load and insert coa template", error);
  }
};
