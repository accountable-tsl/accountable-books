import knexClient from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import { CompanyType } from "../../domains/companies/companies.types";
import { getUserDetails } from "../../domains/users/users.model";
import {
  UserOnboardingStatus,
  UserResponseCamel,
} from "../../domains/users/users.types";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { decideNextStatus } from "./onboarding.utils";

export async function updateOnboardingStatus(
  userId: string
): Promise<ApiResponse<UserResponseCamel>> {
  try {
    const user = await knexClient("users")
      .select(
        "id",
        "onboarding_status",
        "last_active_company_id",
        "invited_at",
        "invite_status",
        "invited_by_id"
      )
      .where({ id: userId })
      .first();

    if (!user || !user.id) {
      return errorResponse("User not found");
    }

    const isInvited: boolean =
      !!user.invited_by_id && !!user.invited_at && !!user.invite_status;

    const company = await knexClient("companies")
      .select("id", "type")
      .where({ id: user.last_active_company_id })
      .orWhere({ created_by_id: user.id })
      .first();

    if (!company || !company.type) {
      return errorResponse("User has no active company");
    }

    const companyType: CompanyType =
      (company.type as CompanyType) ?? "individual";

    const nextStatus = decideNextStatus(
      user.onboarding_status as UserOnboardingStatus,
      companyType,
      isInvited
    );

    if (nextStatus === user.onboarding_status) {
      const fresh = await getUserDetails(userId);
      return successResponse("No changes made", fresh.data);
    }

    // Save new status
    const result = await knexClient("users")
      .where({ id: userId })
      .update({ onboarding_status: nextStatus });
    if (result === 0) {
      return errorResponse("Update failed");
    }

    const fresh = await getUserDetails(userId);
    return successResponse("Onboarding status updated", fresh.data);
  } catch (error) {
    return errorResponse("Error updating onboarding status", error);
  }
}
