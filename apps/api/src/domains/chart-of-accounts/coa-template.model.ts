import type { Knex } from 'knex';

import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { type Company } from '../companies/companies.types.js';
import { selectBestCoaTemplate } from './coa-template-selector.service.js';
import { loadCoaTemplate } from './coa-template.type.js';
import { createCoaAccounts, createDefaultAccounts } from './coa.model.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type {
  LoadCoaTemplateInput,
  SelectBestCoa,
} from './coa-template.type.js';

type CoaTemplateAccountLine = {
  code: string | null;
  name: string;
  description: string | null;
  account_type_key: string;
  locked: boolean;
};

export const loadCoaTemplateForCompany = async (
  knex: Knex.Transaction,
  input: LoadCoaTemplateInput,
): Promise<ApiResponse> => {
  // Validate Input
  const validatedInput = loadCoaTemplate.safeParse(input);
  if (!validatedInput.success)
    return errorResponse('Invalid Input', validatedInput.error.flatten());

  const { companyId, template_name, use_code, additional_info } =
    validatedInput.data;

  try {
    // Fetch company
    const [company]: Partial<Company[]> = await knex('companies')
      .where('id', companyId)
      .select(
        'display_name',
        'type',
        'industry',
        'website',
        'reporting_framework',
        'reporting_currency_id',
      );

    if (!company || !company.type || !company.reporting_currency_id)
      return errorResponse('Company not found or missing required fields');

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
    const validTemplate: CoaTemplateAccountLine[] = await knex('coa_templates')
      .join(
        'account_types',
        'coa_templates.account_type_id',
        'account_types.id',
      )
      .where('coa_templates.is_active', true)
      .where('coa_templates.template_name', chosenTemplate)
      .select(
        'coa_templates.code',
        'coa_templates.name',
        'coa_templates.description',
        'account_types.key as account_type_key',
        'coa_templates.locked',
      );

    if (!validTemplate || !validTemplate.length) {
      // No valid template could be found? Attempt to create default accounts
      await createDefaultAccounts({
        trx: knex,
        companyUUID: companyId,
        userId: input.created_by_id,
      });

      return successResponse(
        `No valid template found. Default accounts created for ${company.display_name}`,
        null,
      );
    }

    await createCoaAccounts({
      trx: knex,
      companyId,
      userId: input.created_by_id,
      accounts: validTemplate.map((account) => ({
        ...account,
        is_active: true,
        source: 'template',
      })),
      versionNote: 'coa_template_creation',
    });

    return successResponse(
      `Coa template with ${validTemplate.length} lines inserted for ${company.display_name}`,
      chosenTemplate,
    );
  } catch (error) {
    return errorResponse('Failed to load and insert coa template', error);
  }
};
