import type { Knex } from "knex";
import * as Sentry from "@sentry/node";
import { ApiResponse } from "../../core/types/api.types";
import { camelToSnake } from "../../shared/utils/formatting.utils";
import { onboardingDirectClient } from "./onboarding.types";
import { createUserDirect } from "../../domains/user/user.model";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { createCompany } from "../../domains/company/company.model";
import { accountTypeIds } from "../../shared/constants/account.constants";
import { DEFAULT_ACCOUNT_TYPE_IDS } from "./onboarding.constants";
import { newCoa } from "../../domains/chart-of-accounts/coa.types";
import { loadCoaTemplateForCompany } from "../../domains/chart-of-accounts/coaTemplate.model";
import { trackEvent } from "../../shared/utils/analytics.utils";

export const onboardingClientDirect = async (
  knex: Knex,
  input: unknown
): Promise<ApiResponse> => {
  const snakeInput = camelToSnake(input);
  const validateInput = onboardingDirectClient.safeParse(snakeInput);

  if (!validateInput.success) {
    return errorResponse("Invalid input", validateInput.error.format());
  }

  const {
    user: userInput,
    company: companyInput,
    firm: firmInput,
  } = validateInput.data;

  let firmId: string | null = null;

  try {
    return await knex.transaction(async (trx) => {
      // Create user
      const user = await createUserDirect(trx, userInput);
      if (!user.success) {
        return errorResponse("User creation failed", user.error);
      }

      // Resolve firm
      if (firmInput?.id) {
        const [verifyFirm] = await trx("accounting_firm").where(
          "id",
          firmInput.id
        );

        if (verifyFirm) {
          firmId = verifyFirm.id;
        }
      } else {
        // Retrive platform firm id
        const platformFirm = await trx("accounting_firm")
          .where("is_platform", true)
          .select("id");

        if (platformFirm.length > 0) {
          return errorResponse("Unable to resolve firm to assign");
        }

        platformFirm && (firmId = platformFirm[0].id);
      }

      if (!firmId) {
        return errorResponse("Unable to resolve firm to assign");
      }

      // Create company
      const company = await createCompany(trx, {
        ...companyInput,
        created_by_id: user.data.id,
        assigned_firm_id: firmId,
      });
      if (!company.success) {
        return errorResponse("Company creation failed", company.error);
      }
      const { count } = await trx("company")
        .where("created_by_id", user.data.id)
        .count<{ count: string }>("id");
      const totalCompaniesByUser = parseInt(count, 10);

      // Assign user-company-role.
      // User is a client if they hit this endpoint
      const [role] = await trx("role").where({ name: "client" }).select("*");
      await trx("user_company_role").insert({
        user_id: user.data.id,
        company_id: company.data.id,
        role_id: role.id,
      });

      const mustHaveAccounts = [
        {
          company_id: company.data.id,
          created_by_id: user.data.id,
          currency_id: company.data.reporting_currency_id,
          name: "Trade Receivables",
          description: "Amount due from customers",
          account_type_id:
            accountTypeIds.ca_trade_receivable ||
            DEFAULT_ACCOUNT_TYPE_IDS.tradeReceivables,
          is_active: true,
        },
        {
          company_id: company.data.id,
          created_by_id: user.data.id,
          currency_id: company.data.reporting_currency_id,
          name: "Trade Payables",
          description: "Amounts owed to suppliers",
          account_type_id:
            accountTypeIds.cl_trade_payable ||
            DEFAULT_ACCOUNT_TYPE_IDS.tradePayables,
          is_active: true,
        },
        {
          company_id: company.data.id,
          created_by_id: user.data.id,
          currency_id: company.data.reporting_currency_id,
          name: "Owner Equity",
          description: "Initial investment or funding",
          account_type_id:
            accountTypeIds.eq_contributed_capital ||
            DEFAULT_ACCOUNT_TYPE_IDS.ownersEquity,
          is_active: true,
        },
      ];

      // User selected cOA, attach selected, otherwise, try to determine and then attach, attach COA Template if required
      let createdCoa;
      if (companyInput.load_coa_template === false) {
        // Load must have accounts = trade receivables, payables, owner's equity
        const validatedMustHaveAcc = newCoa.array().safeParse(mustHaveAccounts);
        if (!validatedMustHaveAcc.success) {
          return errorResponse("Failed to validate must-have accounts");
        }
        const mustHaveCoa = await trx("coa")
          .insert(validatedMustHaveAcc.data)
          .returning("*");
        createdCoa = mustHaveCoa;
      } else {
        const loadedCoa = await loadCoaTemplateForCompany(trx, {
          companyId: company.data.id,
          created_by_id: user.data.id,
          use_code: companyInput.use_code,
        });

        if (!loadedCoa.success) return errorResponse("Unable to load coa");
        createdCoa = loadedCoa.data;
      }

      trackEvent("User Signed Up", user.data.id, {
        email: user.data.email,
        role: "client",
        method: firmInput?.id ? "invite" : "direct",
        firm_id: firmInput?.id || null,
      });

      trackEvent("Company Created", user.data.id, {
        company_id: company.data.id,
        company_type: companyInput.type,
        firm_id: firmId,
        total_companies_by_user: totalCompaniesByUser,
        user_type: "client",
        industry: companyInput.industry,
      });

      return successResponse("Client onboarded successfully", {
        user: user.data,
        company: company.data,
        firm: firmId,
        coa: createdCoa,
      });
    });
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

// export const onboardingAccountingFirm = async (knex: Knex, input: unknown) => {
//   const snakeInput = camelToSnake(input);
//   const validateInput = onboardingAccFirm.safeParse(snakeInput);

//   if (!validateInput.success) {
//     return errorResponse("Invalid input", validateInput.error.format());
//   }

//   const {
//     user: userInput,
//     company: companyInput,
//     firm: firmInput,
//   } = validateInput.data;

//   try {
//     return await knex.transaction(async (trx) => {
//       // Create user
//       const user = await createUserDirect(trx, userInput);
//       if (!user.success) {
//         return errorResponse("User creation failed", user.error);
//       }

//       // Create company
//       const company = await createCompany(trx, {
//         ...companyInput,
//         created_by_id: user.data.id,
//       });
//       if (!company.success) {
//         return errorResponse("Company creation failed", company.error);
//       }

//       const firm = await createAccountingFirm(trx, {
//         ...firmInput,
//         created_by_id: user.data.id,
//       });
//     });
//   } catch (error) {}

//   // Create company
//   // User, Company Successful? User, Company, Role
//   // Attach COA Template to Company if required
//   // Create accounting firm
//   // Link company to accounting firm in accounting firm table
//   // Assign accounting firm to company in company table
// };
