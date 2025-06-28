import type { Knex } from "knex";
import { knexClient } from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import { getSingleCompany } from "../../domains/companies/companies.model";
import {
  CompanyType,
  GetCompanyResponse,
} from "../../domains/companies/companies.types";
import { isUserCompanyOwner } from "../../domains/userRoles/userRoles.model";
import { getUserDetails } from "../../domains/users/users.model";
import { UserResponseCamel } from "../../domains/users/users.types";
import { getCompanyUUID } from "../../shared/utils/random.utils";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import {
  OnboardingCompanyObj,
  OnboardingStateResult,
  OnboardingStepConfig,
  OnboardingStepKey,
  OnboardingUserObj,
} from "./onboarding.types";
import { decideNextStatus, onboardingStepConfig } from "./onboarding.utils";

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

/**
 * Gets the onboarding state for a user in a company
 *
 * This provides information about which onboarding steps are available to the user,
 * whether they've been completed, and whether they're blocked or optional.
 *
 * It also provides information about the user's access to the app: whether they
 * can access the app, and which step they should complete next.
 *
 * @param user The user object, containing the user's ID
 * @param company The company object, containing the company's ID
 *
 * @returns An object containing the onboarding state
 */
export async function getOnboardingState({
  user,
  company,
}: {
  user: OnboardingUserObj;
  company: OnboardingCompanyObj;
}): Promise<OnboardingStateResult> {
  // Determine if the current user is a company owner
  // This affects which onboarding steps they can see and complete
  const isCompanyOwner = await isUserCompanyOwner({
    userId: user?.id,
    companyId: company?.id,
  });

  if (
    user.isPlatformUser ||
    company?.isDemoCompany ||
    company?.isPlatformCompany
  ) {
    return {
      isCompanyOwner,
      canAccessApp: true,
      userStepsComplete: true,
      nextStepToComplete: null,
      steps: [],
    };
  }

  // Filter onboarding steps to only include those available to this user
  // Some steps are restricted to company owners only
  const availableSteps = onboardingStepConfig.filter((step) => {
    if (step.restrictedTo === "company_owner" && !isCompanyOwner) {
      return false;
    }
    return step.isAvailable?.({ user, company, isCompanyOwner }) ?? true;
  });

  // Pre-compute completion status for all steps
  const stepStatusMap = new Map<
    OnboardingStepKey,
    { complete: boolean; step: OnboardingStepConfig }
  >();
  for (const step of availableSteps) {
    const complete = step.isComplete({ user, company });
    stepStatusMap.set(step.key, { complete, step });
  }


  // Process each available step to determine its current status
  const results = Array.from(stepStatusMap.entries())
    .map(([key, { complete, step }]) => {
      // A step is blocked if any of its dependencies are incomplete
      // We only check dependencies that are also available to this user
      const isBlocked = (step.dependsOn || []).some((depKey) => {
        const dep = stepStatusMap.get(depKey);

        // If dependency exists in available steps, check if it's complete
        // If dependency doesn't exist (filtered out), consider it blocking
        return dep ? !dep.complete : true;
      });

      return {
        key,
        label: step.label,
        scope: step.scope,
        complete,
        blocked: isBlocked,
        optional: !!step.optional,
        orderIndex: step.orderIndex ?? 999,
      };
    })
    // Sort steps by their defined order to ensure consistent presentation
    .sort((a, b) => a.orderIndex - b.orderIndex);

  // Find the next step the user should complete
  // This is the first incomplete, non-blocked step in order
  const nextIncompleteStep = results.find(
    (step) => !step.complete && !step.blocked
  );
  const nextStep = nextIncompleteStep ? nextIncompleteStep.key : null;

  // Determine if all steps visible to this user is complete
  const userStepsComplete = results.every((s) => s.complete || s.optional);

  // Check if all company steps are complete (regardless of user role)
  const companySteps = onboardingStepConfig.filter(
    (step) => step.scope === "company"
  );
  const companyStepsComplete = companySteps.every((step) =>
    step.isComplete({ user, company })
  );

  // Determine app access:
  // - Company owners: need to complete all their available required steps
  // - Company members: need their steps complete AND company onboarding complete
  const canAccessApp = isCompanyOwner
    ? userStepsComplete
    : userStepsComplete && companyStepsComplete;

  return {
    isCompanyOwner,
    canAccessApp,
    userStepsComplete,
    nextStepToComplete: nextStep,
    steps: results,
  };
}
