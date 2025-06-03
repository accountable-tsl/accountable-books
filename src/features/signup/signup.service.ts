import type { Knex } from "knex";
import * as Sentry from "@sentry/node";
import { ApiResponse } from "../../core/types/api.types";
import {
  camelToSnake,
  snakeToCamel,
} from "../../shared/utils/formatting.utils";

import { createUserDirect } from "../../domains/users/users.model";
import {
  AppError,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { createCompany } from "../../domains/companies/companies.model";
import { loadCoaTemplateForCompany } from "../../domains/chartOfAccounts/coaTemplate.model";
import { trackEvent } from "../../shared/utils/analytics.utils";
import { createAccountingFirm } from "../../domains/accountingFirms/firms.model";
import { createDefaultAccounts } from "../../domains/chartOfAccounts/coa.model";
import { buildEmailServiceUrl } from "../communications/email/email.utils";
import { sendVerificationEmail } from "../communications/email/email.service";
import {
  CompanyType,
  NewCompany,
  NewCompanyInput,
  NewCompanyInputCamel,
} from "../../domains/companies/companies.types";
import { newAccFirm } from "../../domains/accountingFirms/firms.types";
import { CreateUserDirectResponse, newSignup } from "./signup.types";
import {
  NewUserDirect,
  NewUserInputCamel,
  user,
} from "../../domains/users/users.types";

export const registerNewAccount = async (
  knex: Knex,
  input: { user: NewUserInputCamel; company: NewCompanyInputCamel }
): Promise<ApiResponse> => {
  // Check that company type exists
  if (!input || !input.company.type) {
    return errorResponse("Invalid input or missing company type");
  }

  // Convert to snake case and validate
  const snakeInput = camelToSnake(input);

  const validateInput = newSignup.safeParse(snakeInput);

  if (!validateInput.success) {
    return errorResponse("Invalid input", validateInput.error.flatten());
  }

  // Destructure and retrieve user and company input
  // For firms, we use company data to create firm as well to ease onboarding
  const { user: userInput, company: companyInput } = validateInput.data;

  // Begin signup transaction
  // Once user is created, company is created & assigned to firm,
  // This function should return successful, even if everything else fails
  try {
    const result = await knex.transaction(async (trx) => {
      const { user, company } = await createUserAndCompany(
        trx,
        userInput,
        companyInput
      );

      let firm;
      // For an accounting firm, create accounting_firm
      if (companyInput.type === "accounting_firm") {
        firm = await setupAccountingFirm(trx, {
          companyId: company.id,
          firmData: companyInput,
        });
      }

      await attachChartOfAccounts(trx, {
        companyId: company.id,
        reportingCurrencyId: company.reporting_currency_id,
        userId: user.id,
        loadCoaTemplate: companyInput.load_coa_template || true,
      });

      const { count } = await trx("companies")
        .where("created_by_id", user.id)
        .count<{ count: string }>("id");

      return {
        user,
        company: { ...company, totalCompaniesByUser: parseInt(count, 10) },
        firm,
      };
    });
    const { user, company, firm } = result;
    const { verificationToken, ...userData } = user;

    try {
      trackSignupEvents(
        user.id,
        user.email,
        companyInput.type,
        company.id,
        firm?.id
      );

      //   await sendWelcomeEmail(user.email, user.firstname, verifyUrl); // Build this out later
      const url = buildEmailServiceUrl("verify-email", {
        token: user.verificationToken,
        slug: company.slug,
        email: user.email,
      });
      const sendVerEmail = await sendVerificationEmail({
        to: user.email,
        name: user.firstname,
        url,
      });
      if (!sendVerEmail) {
        errorResponse("Unable to send verification email");
      }
    } catch (error) {
      errorResponse("Post-signup event failed", error);
    }

    return successResponse(
      "User has been registered successfully",
      snakeToCamel({
        user: userData,
        company,
      })
    );
  } catch (error) {
    Sentry.captureException(error, {
      user: {
        email: userInput?.email,
        name: `${userInput.firstname} ${userInput.lastname ? userInput.lastname : ""}`,
      },
      extra: {
        company_type: companyInput.type,
        method: "direct",
        input,
      },
      tags: {
        flow: "newUserSignup",
      },
    });
    return errorResponse(
      `Unable to signup user ${userInput?.email || ""}`,
      error
    );
  }
};

const createUserAndCompany = async (
  trx: Knex.Transaction,
  userInput: NewUserDirect,
  companyInput: NewCompanyInput
) => {
  // Create user
  const userResponse = await createUserDirect(trx, userInput);
  if (!userResponse.success || !userResponse.data?.id) {
    throw new AppError(
      `User creation failed: ${userResponse.message}`,
      userResponse.error
    );
  }

  const platformFirm = await trx("accounting_firms as af")
    .join("companies as c", "af.company_id", "c.id")
    .where("c.is_platform", true)
    .first<{ company_id: string; slug: string }>();

  if (!platformFirm) {
    throw new AppError("Unable to retrieve platform firm");
  }

  const platformFirmId = platformFirm.company_id; // ← new PK
  const platformFirmSlug = platformFirm.slug;

  const { slug, ...restOfCompanyInput } = companyInput;
  // Create company
  const companyResponse = await createCompany(trx, {
    ...restOfCompanyInput,
    created_by_id: userResponse.data?.id,
    assigned_firm_id: platformFirmId,
  });

  if (!companyResponse.success) {
    throw new AppError(`Company creation failed: ${companyResponse.error}`);
  }

  // Assign role
  const roleName = companyInput.type === "accounting_firm" ? "admin" : "client";
  const role = await trx("roles")
    .where("name", roleName)
    .first<{ id: string }>();
  if (!role) throw new AppError(`${roleName} role not found`);
  const roleId = role.id;

  await trx("users_companies_roles").insert({
    user_id: userResponse.data.id,
    company_id: companyResponse.data.id,
    role_id: roleId,
  });

  return {
    user: userResponse.data as CreateUserDirectResponse,
    company: {
      ...companyResponse.data,
      slug: platformFirmSlug,
    } as NewCompany & { id: string; slug: string },
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
  }
) => {
  // Validate Input
  const firmInput = newAccFirm.safeParse({
    ...firmData,
    company_id: companyId,
  });

  // Check if validation succeeded
  if (!firmInput.success) {
    throw new AppError("Invalid input", firmInput.error.flatten());
  }

  // Create accounting firm
  const firmResponse = await createAccountingFirm(trx, firmInput.data!);
  if (!firmResponse.success || !firmResponse.data?.id) {
    throw new AppError(`Firm creation failed: ${firmResponse.message}`);
  }

  // Update the company's assigned_firm_id
  await trx("companies")
    .where("id", companyId)
    .update({ assigned_firm_id: firmResponse.data.id });

  // Assign the company to the firm
  await trx("firms_companies").where("company_id", companyId).update({
    accounting_firm_id: firmResponse.data.id,
  });

  return firmResponse.data;
};
const attachChartOfAccounts = async (
  trx: Knex.Transaction,
  params: {
    companyId: string;
    userId: string;
    reportingCurrencyId: string;
    loadCoaTemplate?: boolean;
  }
): Promise<void> => {
  try {
    if (params.loadCoaTemplate === false) {
      await createDefaultAccounts(
        trx,
        params.companyId,
        params.userId,
        params.reportingCurrencyId
      );
    } else {
      await loadCoaTemplateForCompany(trx, {
        companyId: params.companyId,
        created_by_id: params.userId,
        use_code: true, // Default value
      });
    }
  } catch (error) {
    throw new AppError("Failed to attach chart of accounts", error);
  }
};

export const trackSignupEvents = async (
  userId: string,
  email: string,
  companyType: CompanyType,
  companyId: string,
  firmId?: string
) => {
  try {
    await Promise.all([
      trackEvent("User Signed Up", userId, {
        email,
        role: companyType === "accounting_firm" ? "admin" : "client",
        firm_id: firmId,
      }),
      trackEvent("Company Created", userId, {
        company_id: companyId,
        company_type: companyType,
        firm_id: firmId,
      }),
    ]);
  } catch (error) {
    errorResponse("Analytics event failed", { userId, error });
  }
};
