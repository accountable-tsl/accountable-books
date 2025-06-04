import knexClient from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import { getCompanyUUID } from "../../shared/utils/random.utils";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { NewUserCompanyRole } from "./userCompanyRole.types";

export const getCompanyRolesForUser = async (userId: string) => {
  if (!userId?.trim()) {
    return errorResponse("Please provide a valid user ID");
  }

  const userRoleByCompany = await knexClient("users_companies_roles")
    .select("user_id", "company_id", "role_id")
    .where({ user_id: userId, is_deleted: false });

  if (userRoleByCompany.length === 0) {
    return errorResponse("No user role found");
  }

  return successResponse<NewUserCompanyRole[]>(
    "User roles found",
    userRoleByCompany
  );
};

export const hasAccessToCompany = async (data: {
  userId: string;
  companyId: string;
}): Promise<ApiResponse<{ hasAccess: boolean }>> => {
  console.log("🚨 hasAccessToCompany is being called");
  const { userId, companyId } = data;
  if (!userId?.trim() || !companyId?.trim()) {
    return errorResponse("Please provide a valid user ID and company ID");
  }

  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse("Unauthorized");
    }

    console.log({ companyUUID });

    const allUserRoles = await knexClient("users_companies_roles as ucr")
      .select("roles.name as roleName", "ucr.company_id as userRoleCompanyId")
      .join("roles", "ucr.role_id", "roles.id")
      .where({
        "ucr.user_id": userId,
        "ucr.is_deleted": false,
      });

    console.log({ allUserRoles });

    if (!allUserRoles || allUserRoles.length === 0) {
      return successResponse("Unauthorized", {
        hasAccess: false,
      });
    }

    const isSuperAdmin = allUserRoles.some(
      (role) => role.roleName === "super_admin"
    );
    const isSupport = allUserRoles.some((role) => role.roleName === "support");

    if (isSuperAdmin || isSupport) {
      return successResponse(
        `User has elevated access (${isSuperAdmin ? "Super Admin" : "Support"})`,
        { hasAccess: true }
      );
    }

    const hasCompanyAccess = allUserRoles.some(
      (role) => role.userRoleCompanyId === companyUUID
    );

    return successResponse(
      hasCompanyAccess
        ? "User has standard company access"
        : "User has no access to this company",
      { hasAccess: hasCompanyAccess }
    );
  } catch (error) {
    return errorResponse("Internal server error");
  }
};
