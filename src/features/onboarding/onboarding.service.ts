import knexClient from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import { getUserDetails } from "../../domains/users/users.model";
import {
  UserOnboardingStatus,
  UserResponseCamel,
} from "../../domains/users/users.types";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";

export async function updateOnboardingStatus(
  userId: string,
  newStatus: UserOnboardingStatus
): Promise<ApiResponse<UserResponseCamel>> {
  try {
    const current = await knexClient("users")
      .select("onboarding_status")
      .where({ id: userId })
      .first();

    if (current && current.onboarding_status === newStatus) {
      const newUserData = await getUserDetails(userId);
      return successResponse("No changes made", newUserData.data);
    }

    const result = await knexClient("users")
      .where({ id: userId })
      .update({ onboarding_status: newStatus });

    if (result === 0) {
      return errorResponse("User not found or update failed");
    }

    const newUserData = await getUserDetails(userId);

    return successResponse("Onboarding status updated", newUserData.data);
  } catch (error) {
    return errorResponse("Error updating onboarding status", error);
  }
}
