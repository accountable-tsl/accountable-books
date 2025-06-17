import { knexClient } from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import { getSingleCompany } from "../../domains/companies/companies.model";
import {
  CompanyType,
  GetCompanyResponse,
  onboardingStatus,
  OnboardingStatus,
} from "../../domains/companies/companies.types";
import { getUserDetails } from "../../domains/users/users.model";
import { UserResponseCamel } from "../../domains/users/users.types";
import { getCompanyUUID } from "../../shared/utils/random.utils";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { decideNextStatus } from "./onboarding.utils";

async function checkOnboardingPrerequisites(
  userId: string,
  companyId: string,
  currentStatus: OnboardingStatus
): Promise<{ valid: boolean; message: string }> {
  if (!onboardingStatus.options.includes(currentStatus)) {
    return { valid: false, message: "Invalid onboarding status provided" };
  }

  try {
    const [user, company] = await Promise.all([
      knexClient("users")
        .select("email_verified")
        .where({ id: userId })
        .first(),

      knexClient("companies")
        .select(
          "id",
          "type",
          "legal_name",
          "short_code",
          "industry",
          "year_end_day",
          "year_end_month",
          "country_id",
          "reporting_currency_id",
          "onboarding_status"
        )
        .where({ id: companyId })
        .first(),
    ]);

    if (!user) return { valid: false, message: "User not found" };
    if (!company) return { valid: false, message: "Company not found" };

    switch (currentStatus) {
      case "not_started":
        if (!user.email_verified) {
          return { valid: false, message: "Email not verified" };
        }
        return { valid: true, message: "Email verified, ready for next step" };

      case "email_verified":
        return {
          valid: true,
          message: "No checks needed, proceed by company type",
        };

      case "company_vitals_needed":
        if (
          !company.legal_name ||
          !company.short_code ||
          !company.industry ||
          !company.year_end_day ||
          !company.year_end_month ||
          !company.reporting_currency_id ||
          !company.country_id
        ) {
          return {
            valid: false,
            message:
              "Legal name, short code, industry, year end day, year end month, reporting currency and country are required",
          };
        }
        return { valid: true, message: "Company vitals complete" };

      case "first_bank_account_needed":
        const bankAccount = await knexClient("bank_accounts")
          .select("id")
          .where({ company_id: company.id })
          .first();
        if (!bankAccount) {
          return { valid: false, message: "No bank account added for company" };
        }
        return { valid: true, message: "Bank account verified" };

      default:
        return {
          valid: true,
          message: "Onboarding complete, no checks needed",
        };
    }
  } catch (error) {
    return {
      valid: false,
      message:
        "An unexpected error occurred within checkOnboardingPrerequisites",
    };
  }
}
export async function updateOnboardingStatus(
  userId: string,
  companyId: string,
  isLoggedIn: boolean = false
): Promise<
  ApiResponse<{ user: UserResponseCamel; company: GetCompanyResponse }>
> {
  if (!userId || !companyId) {
    return errorResponse("User ID and Company ID are required");
  }

  if (userId.length > 50 || companyId.length > 50) {
    return errorResponse("Invalid IDs");
  }

  try {
    const user = await knexClient("users")
      .select("id", "invited_at", "invite_status", "invited_by_id")
      .where({ id: userId })
      .first();

    if (!user || !user.id) {
      return errorResponse("User not found");
    }

    const isInvited: boolean =
      !!user.invited_by_id && !!user.invited_at && !!user.invite_status;

    const companyUUID = await getCompanyUUID(companyId);
    const company = await knexClient("companies")
      .select("id", "type", "onboarding_status")
      .where({ id: companyUUID })
      .first();

    if (!company || !company.type || !company.onboarding_status) {
      return errorResponse("User has no active company");
    }

    const companyType: CompanyType =
      (company.type as CompanyType) ?? "individual";

    const check = await checkOnboardingPrerequisites(
      userId,
      companyUUID, // UUID
      company.onboarding_status
    );

    if (!check.valid) {
      return errorResponse(check.message);
    }

    const nextStatus: OnboardingStatus = decideNextStatus(
      company.onboarding_status as OnboardingStatus,
      companyType,
      isLoggedIn,
      isInvited
    );

    if (nextStatus === company.onboarding_status) {
      const freshUser = await getUserDetails(userId);
      const freshCompany = await getSingleCompany(company.id);
      return successResponse("No changes made to onboarding status", {
        user: freshUser.data,
        company: freshCompany.data,
      });
    }

    // Save new status
    const result = await knexClient("companies")
      .where({ id: companyUUID, onboarding_status: company.onboarding_status })
      .update({ onboarding_status: nextStatus });

    if (result === 0) {
      return errorResponse(
        "Onboarding status was modified by another process. Please retry."
      );
    }

    const freshUser = await getUserDetails(userId);
    const freshCompany = await getSingleCompany(company.id);
    return successResponse("Onboarding status updated", {
      user: freshUser.data,
      company: freshCompany.data,
    });
  } catch (error) {
    return errorResponse("Error updating onboarding status", error);
  }
}
