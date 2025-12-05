import * as Sentry from '@sentry/node';
import type { Knex } from 'knex';

import type { ApiResponse } from '../../core/types/api.types.js';
import { knexClient } from '../../db/knexClient.js';
import { createAccountingFirm } from '../../domains/accountingFirms/firms.model.js';
import { newAccFirm } from '../../domains/accountingFirms/firms.types.js';
import { createDefaultAccounts } from '../../domains/chart-of-accounts/coa.model.js';
import { loadCoaTemplateForCompany } from '../../domains/chart-of-accounts/coa-template.model.js';
import { createCompany } from '../../domains/companies/companies.model.js';
import {
  type CompanyType,
  type NewCompanyInput,
  type NewCompanyInputCamel,
} from '../../domains/companies/companies.types.js';
import { type RoleKey } from '../../domains/roles/roles.types.js';
import { grantDirectAccess } from '../../domains/userRoles/userRoles.model.js';
import { createUserDirect } from '../../domains/users/users.model.js';
import {
  type CreateUserResponse,
  type NewUserDirect,
  type NewUserInputCamel,
} from '../../domains/users/users.types.js';
import { sendVerificationEmail } from '../../features/communications/email/email.service.js';
import { buildEmailServiceUrl } from '../../features/communications/email/email.utils.js';
import { trackEvent } from '../../shared/utils/analytics.utils.js';
import {
  camelToSnake,
  snakeToCamel,
} from '../../shared/utils/formatting.utils.js';
import {
  AppError,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import {
  createCompleteCompanyOnboardingState,
  createCompleteUserOnboardingState,
} from '../onboarding/onboarding.utils.js';
import {
  type CreateUserDirectResponse,
  type NewCompanyRes,
  type NewCompanyResCamel,
  newSignup,
} from './signup.types.js';

/**
 * Registers a new user and company.
 *
 * @param knex - Knex instance
 * @param input - Object with user and company data
 * @returns ApiResponse
 *
 * This function will register a new user and company, and assign the company to the user.
 * If the company type is an accounting firm, it will also create an accounting_firm entity.
 * If the company type is not an accounting firm, it will not create an accounting_firm entity.
 * After the user and company are created, it will also assign a chart of accounts to the company.
 * If the company type is an accounting firm, it will load the default chart of accounts for the company.
 * If the company type is not an accounting firm, it will not load the default chart of accounts.
 * The function will also track events for the signup.
 *
 * If the input is invalid, the function will throw an error.
 * If the user or company creation fails, the function will throw an error.
 * If the accounting_firm creation fails, the function will throw an error.
 * If the chart of accounts assignment fails, the function will throw an error.
 *
 * @throws AppError
 */
export const registerNewAccount = async (input: {
  user: NewUserInputCamel;
  company: NewCompanyInputCamel;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{ user: CreateUserResponse; company: NewCompanyResCamel }>
> => {
  // Check that company type exists
  if (!input.user || !input.company.type) {
    return errorResponse('Invalid input or missing company type');
  }

  const { trx, ...rest } = input;
  // Convert to snake case and validate
  const snakeInput = camelToSnake(rest);

  const validateInput = newSignup.safeParse(snakeInput);
  if (!validateInput.success) {
    return errorResponse('Invalid input', validateInput.error.issues);
  }

  // Destructure and retrieve user and company input
  // For firms, we use company data to create firm as well to ease onboarding
  const { user: userInput, company: companyInput } = validateInput.data;

  // Begin signup transaction
  // Once user is created, company is created & assigned to firm,
  // Once this fn is successful, return successful, even if everything else fails
  const registerNewAccountFn = async (knex: Knex.Transaction) => {
    const { user, company } = await createUserAndCompany(
      knex,
      userInput,
      companyInput,
    );

    let firm;
    // For an accounting firm, create accounting_firm
    if (companyInput.type === 'accounting_firm') {
      firm = await setupAccountingFirm(knex, {
        companyId: company.id,
        firmData: companyInput,
      });
    }

    await attachChartOfAccounts(knex, {
      companyUUID: company.id,
      reportingCurrencyId: company.reporting_currency_id,
      userId: user.id,
      loadCoaTemplate: companyInput.load_coa_template || true,
    });

    const [{ count }] = (await knex('companies')
      .where('created_by_id', user.id)
      .count('id as count')) as { count: string }[];

    const numericCount = parseInt(count, 10);

    return {
      user,
      company: { ...company, totalCompaniesByUser: numericCount },
      firm,
    };
  };

  let result;
  try {
    if (trx) {
      result = await registerNewAccountFn(trx);
    } else {
      result = await knexClient.transaction((newTrx) =>
        registerNewAccountFn(newTrx),
      );
    }
  } catch (error: any) {
    Sentry.captureException(error, {
      user: {
        email: userInput?.email,
        name: `${userInput.firstname} ${userInput.lastname ? userInput.lastname : ''}`,
      },
      extra: {
        company_type: companyInput.type,
        method: 'direct',
        input,
      },
      tags: {
        flow: 'newUserSignup',
      },
    });
    return errorResponse(
      `Unable to signup user ${userInput?.email || ''}`,
      error,
    );
  }

  const warnings: string[] = [];

  // Run side effects outside transaction, best effort
  (async () => {
    const { user, company: companyRes, firm } = result;

    try {
      await trackSignupEvents(
        user.id,
        user.email,
        companyRes.type,
        companyRes.id,
        firm?.id,
      );
    } catch (error: any) {
      Sentry.captureException(error, {
        tags: { flow: 'postSignupEvents' },
      });
      warnings.push('Failed to track signup events');
    }

    if (!companyRes.is_demo_company) {
      try {
        const url = buildEmailServiceUrl('verify-email', {
          userId: user.id,
          token: user.verificationToken,
        });

        //   await sendWelcomeEmail(user.email, user.firstname, verifyUrl); // Build this out later
        const sentVerEmail = await sendVerificationEmail({
          to: user.email,
          name: user.firstname,
          url,
        });

        if (!sentVerEmail) {
          warnings.push('Verification email was not sent');
          errorResponse(
            'Unable to send verification email on signup',
            sentVerEmail,
            {
              report: true,
            },
          );
        }
      } catch (error: any) {
        errorResponse('Unable to send verification email on signup', error, {
          report: true,
        });
        Sentry.captureException(error, {
          tags: { flow: 'postSignupEvents' },
        });
        warnings.push('Failed to send verification email on signup');
      }
    }
  })();

  return successResponse('User has been registered successfully', {
    user: result.user,
    company: snakeToCamel(result.company) as NewCompanyResCamel,
    warnings: warnings.length ? warnings : undefined,
  });
};

const createUserAndCompany = async (
  trx: Knex.Transaction,
  userInput: NewUserDirect,
  companyInput: NewCompanyInput,
): Promise<{ user: CreateUserResponse; company: NewCompanyRes }> => {
  const now = new Date();

  // Create user
  const userResponse = await createUserDirect({
    input: {
      ...userInput,
      ...(userInput.is_demo_user
        ? {
            email_verified_at: now,
            onboarding_state: createCompleteUserOnboardingState(),
          }
        : {}),
    },
    transaction: trx,
  });
  if (!userResponse.success || !userResponse.data?.id) {
    throw new AppError(
      `User creation failed: ${userResponse.message}`,
      userResponse.error,
    );
  }

  const platformFirm = await trx('accounting_firms_meta as af')
    .join('companies as c', 'af.company_id', 'c.id')
    .where('c.is_platform', true)
    .first<{ company_id: string; slug: string }>();

  if (!platformFirm) {
    throw new AppError('Unable to retrieve platform firm');
  }

  const platformFirmId = platformFirm.company_id; // new PK
  const platformFirmSlug = platformFirm.slug;

  const { slug, ...restOfCompanyInput } = companyInput;
  // Create company
  const companyResponse = await createCompany({
    company: {
      ...restOfCompanyInput,
      created_by_id: userResponse.data?.id,
      assigned_firm_id: platformFirmId,
      ...(restOfCompanyInput.is_demo_company
        ? {
            onboarding_state: createCompleteCompanyOnboardingState(
              restOfCompanyInput.type,
            ),
            onboarding_completed_at: now,
          }
        : {}),
    },
    transaction: trx,
  });

  if (!companyResponse.success || !companyResponse.data?.id) {
    throw new AppError(`Company creation failed: ${companyResponse.error}`);
  }

  // Assign role
  const roleKey: RoleKey =
    companyInput.type === 'accounting_firm' ? 'firm_owner' : 'client_owner';
  const assignRole = await grantDirectAccess({
    trx,
    userId: userResponse.data.id,
    companyId: companyResponse.data.short_code,
    roleKey,
    grantedBy: userResponse.data.id,
  });
  if (!assignRole.success) {
    throw new AppError(`Role assignment failed: ${assignRole.message}`);
  }

  const coy: NewCompanyRes = {
    id: companyResponse.data.id,
    ...companyResponse.data,
    slug: platformFirmSlug,
  };
  return {
    user: userResponse.data,
    company: coy,
  };
};

const setupAccountingFirm = async (
  trx: Knex.Transaction,
  {
    companyId,
    firmData,
  }: {
    companyId: string;
    firmData: NewCompanyInput;
  },
) => {
  // Validate Input
  const firmInput = newAccFirm.safeParse({
    ...firmData,
    company_id: companyId,
  });

  // Check if validation succeeded
  if (!firmInput.success || !firmInput.data) {
    throw new AppError('Invalid input', firmInput.error.flatten());
  }

  // Create accounting firm
  const firmResponse = await createAccountingFirm(trx, firmInput.data);
  if (!firmResponse.success || !firmResponse.data?.id) {
    throw new AppError(`Firm creation failed: ${firmResponse.message}`);
  }

  // Update the company's assigned_firm_id
  await trx('companies')
    .where('id', companyId)
    .update({ assigned_firm_id: firmResponse.data.id });

  // Assign the company to the firm
  await trx('client_firm_assignments')
    .where('client_company_id', companyId)
    .update({
      accounting_firm_company_id: firmResponse.data.id,
    });

  return firmResponse.data;
};
const attachChartOfAccounts = async (
  trx: Knex.Transaction,
  params: {
    companyUUID: string;
    userId: string;
    reportingCurrencyId: string;
    loadCoaTemplate?: boolean;
  },
): Promise<void> => {
  const { companyUUID, userId, reportingCurrencyId, loadCoaTemplate } = params;
  try {
    if (loadCoaTemplate === false) {
      await createDefaultAccounts({
        trx,
        companyUUID,
        userId,
        reportingCurrencyId,
      });
    } else {
      await loadCoaTemplateForCompany(trx, {
        companyId: companyUUID,
        created_by_id: userId,
        use_code: true, // Default value
      });
    }
  } catch (error: any) {
    throw new AppError('Failed to attach chart of accounts', error);
  }
};

export const trackSignupEvents = async (
  userId: string,
  email: string,
  companyType: CompanyType,
  companyId: string,
  firmId?: string,
) => {
  try {
    await Promise.all([
      trackEvent('User Signed Up', userId, {
        email,
        role: companyType === 'accounting_firm' ? 'admin' : 'client',
        firm_id: firmId,
      }),
      trackEvent('Company Created', userId, {
        company_id: companyId,
        company_type: companyType,
        firm_id: firmId,
      }),
    ]);
  } catch (error: any) {
    errorResponse('Analytics event failed', { userId, error });
  }
};
