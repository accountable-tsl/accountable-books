import type { Knex } from 'knex';
import * as Sentry from '@sentry/node';

import { knexClient } from '../../db/knexClient.js';
import {
  type CompanyType,
  type NewCompanyInput,
  type NewCompanyInputCamel,
} from '../../domains/companies/companies.types.js';
import {
  provisionCompanyWorkspace,
  runWorkspaceProvisioningSideEffects,
} from '../../domains/companies/company-provisioning.service.js';
import { isDemoWorkspace } from '../../domains/companies/workspace-class.js';
import { createUserDirect } from '../../domains/users/users.model.js';
import {
  type CreateUserResponse,
  type NewUserDirect,
  type NewUserInputCamel,
} from '../../domains/users/users.types.js';
import { sendVerificationEmail } from '../../features/communications/email/email.service.js';
import { buildEmailServiceUrl } from '../../features/communications/email/email.utils.js';
import { scrubForTelemetry } from '../../shared/telemetry/scrub.js';
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
import { newSignup } from './signup.types.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type {
  CreateUserDirectResponse,
  NewCompanyRes,
  NewCompanyResCamel,
} from './signup.types.js';

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

  // Begin signup transaction: user + company provisioning are atomic.
  // Post-transaction side effects (email, analytics) are best-effort and never block the response.
  const registerNewAccountFn = async (knex: Knex.Transaction) => {
    const { user, company, firm, pendingSideEffects } =
      await createUserAndCompany(knex, userInput, companyInput);

    const [{ count }] = (await knex('companies')
      .where('created_by_id', user.id)
      .count('id as count')) as { count: string }[];

    const numericCount = parseInt(count, 10);

    return {
      user,
      company: { ...company, totalCompaniesByUser: numericCount },
      firm,
      pendingSideEffects,
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
        input: scrubForTelemetry(input),
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
    const { user, company: companyRes, firm, pendingSideEffects } = result;

    await runWorkspaceProvisioningSideEffects(pendingSideEffects);

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

    if (!isDemoWorkspace(companyRes.workspace_class)) {
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
): Promise<{
  user: CreateUserResponse;
  company: NewCompanyRes;
  firm?: { id: string; slug: string; firm_type: string | null };
  pendingSideEffects: {
    companyId: string;
    userId: string;
    mode: 'normal' | 'skip_jobs';
  };
}> => {
  const now = new Date();

  // Create user
  const userResponse = await createUserDirect({
    input: {
      ...userInput,
      ...(userInput.user_type === 'demo'
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

  const provisioned = await provisionCompanyWorkspace({
    trx,
    actorUserId: userResponse.data.id,
    ownerUserId: userResponse.data.id,
    billingEmail: userResponse.data.email,
    policy: { kind: userInput.user_type === 'demo' ? 'demo' : 'signup' },
    company: {
      ...companyInput,
      created_by_id: userResponse.data.id,
      ...(companyInput.workspace_class === 'demo'
        ? {
            onboarding_state: createCompleteCompanyOnboardingState(
              companyInput.type,
            ),
            onboarding_completed_at: now,
          }
        : {}),
    },
  });

  const assignedFirm = await trx('accounting_firms_meta')
    .where({ company_id: provisioned.assignment.assignedFirmId })
    .select('slug')
    .first<{ slug: string | null }>();

  if (!assignedFirm?.slug) {
    throw new AppError(
      `Managing firm slug not found for company ${provisioned.company.id}`,
    );
  }

  const coy: NewCompanyRes = {
    ...provisioned.company,
    slug: provisioned.firmMeta?.slug ?? assignedFirm.slug,
  };
  return {
    user: userResponse.data,
    company: coy,
    firm: provisioned.firmMeta
      ? {
          id: provisioned.company.id,
          slug: provisioned.firmMeta.slug,
          firm_type: null,
        }
      : undefined,
    pendingSideEffects: provisioned.pendingSideEffects,
  };
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
