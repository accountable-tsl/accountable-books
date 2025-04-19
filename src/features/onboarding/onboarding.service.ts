import type { Knex } from "knex";
import * as Sentry from "@sentry/node";
import { ApiResponse } from "../../core/types/api.types";
import {
  camelToSnake,
  snakeToCamel,
} from "../../shared/utils/formatting.utils";
import { onboardingAccFirm, onboardingDirectClient } from "./onboarding.types";
import { createUserDirect } from "../../domains/user/user.model";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { createCompany } from "../../domains/company/company.model";
import { loadCoaTemplateForCompany } from "../../domains/chartOfAccounts/coaTemplate.model";
import { trackEvent } from "../../shared/utils/analytics.utils";
import {
  createAccountingFirm,
  resolveFirm,
} from "../../domains/accountingFirm/accountingFirm.model";
import { createDefaultAccounts } from "../../domains/chartOfAccounts/coa.model";
import { determineFirmCompanyDisplayName } from "./onboarding.utils";

export const onboardingClientDirect = async (
  knex: Knex,
  input: unknown
): Promise<ApiResponse> => {
  const snakeInput = camelToSnake(input);
  const validateInput = onboardingDirectClient.safeParse(snakeInput);

  if (!validateInput.success) {
    return errorResponse("Invalid input", validateInput.error.flatten());
  }

  const {
    user: userInput,
    company: companyInput,
    firm: firmInput,
  } = validateInput.data;

  console.log(userInput);

  let firmId: string | null = null;

  try {
    const result = await knex.transaction(async (trx) => {
      // Create user
      const user = await createUserDirect(trx, userInput);
      console.log(user);
      if (!user.success) {
        throw new Error(`User creation failed: ${user.error}`);
      }

      // Resolve firm
      firmId = await resolveFirm(trx, firmInput?.id);
      if (!firmId) {
        throw new Error("Unable to resolve firm to assign");
      }

      // Create company
      const company = await createCompany(trx, {
        ...companyInput,
        created_by_id: user.data.id,
        assigned_firm_id: firmId,
      });
      if (!company.success) {
        throw new Error(`Company creation failed: ${company.error}`);
      }
      const { count } = await trx("company")
        .where("created_by_id", user.data.id)
        .count<{ count: string }>("id");
      const totalCompaniesByUser = parseInt(count, 10);

      // Assign user-company-role.
      // User is a client if they hit this endpoint
      const [role] = await trx("role").where({ name: "client" }).select("*");
      if (!role) throw new Error("Client role not found");

      await trx("user_company_role").insert({
        user_id: user.data.id,
        company_id: company.data.id,
        role_id: role.id,
      });

      let createdCoa;
      if (companyInput.load_coa_template === false) {
        // Load must have accounts = trade receivables, payables, owner's equity
        const mustHaveCoa = await createDefaultAccounts(
          trx,
          company.data.id,
          user.data.id,
          company.data.reporting_currency_id
        );
        createdCoa = mustHaveCoa;
      } else {
        const loadedCoa = await loadCoaTemplateForCompany(trx, {
          companyId: company.data.id,
          created_by_id: user.data.id,
          use_code: companyInput.use_code,
        });

        if (!loadedCoa.success) {
          throw new Error(
            `COA loading failed: ${loadedCoa.error || "Unable to load COA"}`
          );
        }
        createdCoa = loadedCoa.data;
      }

      return { user, company, firmId, createdCoa, totalCompaniesByUser };
    });

    trackEvent("User Signed Up", result.user.data.id, {
      email: result.user.data.email,
      role: "client",
      method: firmInput?.id ? "invite" : "direct",
      firm_id: firmInput?.id || null,
    });

    trackEvent("Company Created", result.user.data.id, {
      company_id: result.company.data.id,
      company_type: companyInput.type,
      firm_id: firmId,
      total_companies_by_user: result.totalCompaniesByUser,
      user_type: "client",
      industry: companyInput.industry,
    });

    return successResponse(
      "Client onboarded successfully",
      snakeToCamel({
        user: result.user.data,
        company: result.company.data,
        firm: firmId,
        coa: result.createdCoa,
      })
    );
  } catch (error) {
    Sentry.captureException(error, {
      user: {
        email: userInput?.email,
        name: `${userInput.firstname} ${userInput.lastname ? userInput.lastname : ""}`,
      },
      extra: {
        firm_id: firmId,
        company_type: companyInput.type,
        method: firmInput?.id ? "invite" : "direct",
        input,
      },
      tags: {
        flow: "onboardingClientDirect",
      },
    });
    return errorResponse("Unable to onboard user", error);
  }
};

export const onboardingAccountingFirm = async (knex: Knex, input: unknown) => {
  const snakeInput = camelToSnake(input);
  const validateInput = onboardingAccFirm.safeParse(snakeInput);

  if (!validateInput.success) {
    return errorResponse("Invalid input", validateInput.error.flatten());
  }

  const {
    user: userInput,
    company: companyInput,
    firm: firmInput,
  } = validateInput.data;

  try {
    const result = await knex.transaction(async (trx) => {
      // Create user
      const user = await createUserDirect(trx, userInput);
      if (!user.success) {
        throw new Error(`User creation failed: ${user.error}`);
      }

      const firmCompanyDisplayName = determineFirmCompanyDisplayName(
        firmInput.legal_name,
        firmInput.display_name
      );

      // Create company
      const company = await createCompany(trx, {
        ...companyInput,
        created_by_id: user.data.id,
        legal_name: companyInput.legal_name,
        display_name: firmCompanyDisplayName,
        type: "accounting_firm",
      });
      if (!company.success) {
        throw new Error(`Company creation failed: ${company.error}`);
      }

      let createdCoa;
      if (companyInput.load_coa_template === false) {
        // All coys must have accounts = trade receivables, payables, owner's equity
        const mustHaveCoa = await createDefaultAccounts(
          trx,
          company.data.id,
          user.data.id,
          company.data.reporting_currency_id
        );
        createdCoa = mustHaveCoa;
      } else {
        const loadedCoa = await loadCoaTemplateForCompany(trx, {
          companyId: company.data.id,
          created_by_id: user.data.id,
          use_code: companyInput.use_code,
        });

        if (!loadedCoa.success) {
          throw new Error(
            `COA loading failed: ${loadedCoa.error || "Unable to load COA"}`
          );
        }
        createdCoa = loadedCoa.data;
      }

      // Create firm
      const firm = await createAccountingFirm(trx, {
        ...firmInput,
        display_name: companyInput.display_name || companyInput.legal_name,
        country_id: companyInput.country_id,
        company_id: company.data.id,
        created_by_id: user.data.id,
      });

      if (!firm.success) {
        throw new Error(`Firm creation failed: ${firm.error}`);
      }

      // Assign firm-company to firm
      await trx("company").where("id", company.data.id).update({
        assigned_firm_id: firm.data.id,
      });

      // Assign admin role
      const [role] = await trx("role").where({ name: "admin" }).select("id");
      if (!role) throw new Error("Admin role not found");
      await trx("user_company_role").insert({
        user_id: user.data.id,
        company_id: company.data.id,
        role_id: role.id,
      });

      // Get total companies by user
      const { count } = await trx("company")
        .where("created_by_id", user.data.id)
        .count<{ count: string }>("id");
      const totalCompaniesByUser = parseInt(count, 10) || 1;

      return { user, company, firm, createdCoa, totalCompaniesByUser };
    });

    try {
      trackEvent("User Signed Up", result.user.data.id, {
        email: result.user.data.email,
        role: "admin",
        method: "direct",
        firm_id: result.firm.data.id,
      });

      trackEvent("Company Created", result.user.data.id, {
        company_id: result.company.data.id,
        company_type: companyInput.type,
        firm_id: result.firm.data.id,
        total_companies_by_user: result.totalCompaniesByUser,
        user_type: "admin",
        industry: companyInput.industry,
      });
    } catch (trackError) {
      console.warn("Failed to track event:", trackError);
    }

    return successResponse(
      "Accounting firm onboarded successfully",
      snakeToCamel({
        user: result.user.data,
        company: result.company.data,
        firm: result.firm.data,
        coa: result.createdCoa,
      })
    );
  } catch (error) {
    try {
      Sentry.captureException(error, {
        user: {
          email: userInput?.email,
          name: `${userInput.firstname} ${userInput.lastname ? userInput.lastname : ""}`,
        },
        extra: {
          firm_name: firmInput?.legal_name,
          company_type: companyInput.type,
          method: "direct",
          input,
        },
        tags: {
          flow: "onboardingAccountingFirm",
        },
      });
    } catch (sentryError) {
      console.warn("Failed to log to Sentry:", sentryError);
    }
    return errorResponse("Onboarding accounting firm failed", error);
  }
};
