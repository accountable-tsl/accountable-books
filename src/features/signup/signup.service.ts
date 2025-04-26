import type { Knex } from "knex";
import * as Sentry from "@sentry/node";
import { ApiResponse } from "../../core/types/api.types";
import {
  camelToSnake,
  snakeToCamel,
} from "../../shared/utils/formatting.utils";

import { createUserDirect } from "../../domains/user/user.model";
import {
  errorResponse,
  successResponse,
  throwError,
} from "../../shared/utils/response.utils";
import { createCompany } from "../../domains/companies/companies.model";
import { loadCoaTemplateForCompany } from "../../domains/chartOfAccounts/coaTemplate.model";
import { trackEvent } from "../../shared/utils/analytics.utils";
import { createAccountingFirm } from "../../domains/accountingFirm/accountingFirm.model";
import { createDefaultAccounts } from "../../domains/chartOfAccounts/coa.model";
import { buildEmailServiceUrl } from "../../domains/communications/email.utils";
import { sendVerificationEmail } from "../../domains/communications/email.service";
import {
  CompanyType,
  NewCompany,
  NewCompanyInput,
} from "../../domains/companies/companies.types";
import { newAccFirm } from "../../domains/accountingFirm/accountingFirm.types";
import { CreateUserDirectResponse, newSignup } from "./signup.types";
import { NewUserDirect, user } from "../../domains/user/user.types";

export const registerNewAccount = async (
  knex: Knex,
  input: unknown & { company: { type: CompanyType } }
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
      if (companyInput.type === "accounting_firms") {
        firm = await setupAccountingFirm(trx, {
          companyId: company.id,
          userId: user.id,
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
    throwError(
      `User creation failed: ${userResponse.message}`,
      userResponse.error
    );
  }

  let platformFirmId: string = "";
  // Get platform firmId
  const platformFirm = await trx("accounting_firms")
    .where("is_platform", true)
    .first();
  if (!platformFirm || !platformFirm.id) {
    throwError("Unable to retrieve platform firm");
  } else {
    platformFirmId = platformFirm.id;
  }

  // Create company
  const companyResponse = await createCompany(trx, {
    ...companyInput,
    created_by_id: userResponse.data?.id,
    assigned_firm_id: platformFirmId,
  });

  if (!companyResponse.success) {
    throwError(`Company creation failed: ${companyResponse.error}`);
  }

  console.log("Company Response", companyResponse.data);
  // Assign role
  const roleName =
    companyInput.type === "accounting_firms" ? "admin" : "client";
  const role = await trx("roles")
    .where("name", roleName)
    .first<{ id: string }>();
  if (!role) throwError(`${roleName} role not found`);
  const roleId = role.id;

  await trx("users_companies_roles").insert({
    user_id: userResponse.data.id,
    company_id: companyResponse.data.id,
    role_id: roleId,
  });

  return {
    user: userResponse.data as CreateUserDirectResponse,
    company: companyResponse.data as NewCompany & { id: string },
  };
};

const setupAccountingFirm = async (
  trx: Knex.Transaction,
  {
    companyId,
    userId,
    firmData,
  }: {
    companyId: string;
    userId: string;
    firmData: NewCompanyInput;
  }
) => {
  // Validate Input
  const firmInput = newAccFirm.safeParse({
    ...firmData,
    firm_size: firmData.team_size,
    company_id: companyId,
    created_by_id: userId,
  });

  // Check if validation succeeded
  if (!firmInput.success) {
    throwError("Invalid input", firmInput.error.flatten());
  }

  // Create accounting firm
  const firmResponse = await createAccountingFirm(trx, firmInput.data!);
  if (!firmResponse.success) {
    throwError(`Firm creation failed: ${firmResponse.error}`);
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
    throwError("Failed to attach chart of accounts", error);
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
        role: companyType === "accounting_firms" ? "admin" : "client",
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
