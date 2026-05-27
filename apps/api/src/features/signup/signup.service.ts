import type { Knex } from 'knex';

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
import { captureProductEvent } from '../../shared/telemetry/capture-product-event.js';
import { captureSentryException } from '../../shared/telemetry/capture-sentry-exception.js';
import {
  camelToSnake,
  snakeToCamel,
} from '../../shared/utils/formatting.utils.js';
import {
  AppError,
  ErrorCode,
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
    captureSignupFailedEvent({
      companyType: input.company?.type,
      errorCode: ErrorCode.INVALID_INPUT,
      step: 'validate_input',
    });

    return errorResponse('Invalid input or missing company type', undefined, {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  const { trx, ...rest } = input;
  // Convert to snake case and validate
  const snakeInput = camelToSnake(rest);

  const validateInput = newSignup.safeParse(snakeInput);
  if (!validateInput.success) {
    captureSignupFailedEvent({
      companyType: input.company.type,
      errorCode: ErrorCode.INVALID_INPUT,
      step: 'validate_input',
    });

    return errorResponse('Invalid input', validateInput.error.issues, {
      code: ErrorCode.INVALID_INPUT,
    });
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
    captureSignupFailedEvent({
      companyType: companyInput.type,
      errorCode: error instanceof AppError ? error.code : ErrorCode.GENERIC,
      step: 'register_account',
    });

    captureSentryException(error, {
      flow: 'signup',
      step: 'register_account',
      errorCode: error instanceof AppError ? error.code : ErrorCode.GENERIC,
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

    await trackSignupEvents(user.id, companyRes.type, companyRes.id, firm?.id);

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
        }
      } catch (error: unknown) {
        captureSentryException(error, {
          flow: 'signup',
          step: 'send_verification_email',
          userId: user.id,
          companyId: companyRes.id,
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
  companyType: CompanyType,
  companyId: string,
  firmId?: string,
) => {
  try {
    captureProductEvent('signup.completed', {
      assigned_firm_id: firmId,
      company_id: companyId,
      company_type: companyType,
      role: companyType === 'accounting_firm' ? 'admin' : 'client',
      user_id: userId,
    });
    captureProductEvent('workspace.created', {
      assigned_firm_id: firmId,
      company_id: companyId,
      company_type: companyType,
      user_id: userId,
    });
  } catch (error: unknown) {
    captureSentryException(error, {
      flow: 'signup',
      step: 'track_signup_events',
      userId,
      companyId,
    });
  }
};

function captureSignupFailedEvent(input: {
  companyId?: string;
  companyType?: string;
  errorCode: string;
  step: string;
  userId?: string;
}) {
  captureProductEvent('signup.failed', {
    company_id: input.companyId,
    company_type: input.companyType,
    error_code: input.errorCode,
    flow: 'signup',
    step: input.step,
    user_id: input.userId,
  });
}
