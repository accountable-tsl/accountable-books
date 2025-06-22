import { knexClient } from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import { RoleName } from "../../core/types/db.types";
import { getCompanyUUID } from "../../shared/utils/random.utils";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { getRoleId } from "../roles/roles.model";
import { NewUserCompanyRole } from "./usersCompaniesRoles.types";

export const getCompanyRolesForUser = async (userId: string) => {
  if (!userId?.trim()) {
    return errorResponse("Please provide a valid user ID");
  }

  const userRoleByCompany = await knexClient("users_companies_roles as ucr")
    .select(
      "ucr.user_id as userId",
      "c.short_code as companyId",
      "ucr.role_id as roleId"
    )
    .join("companies as c", "ucr.company_id", "c.id")
    .where({ "ucr.user_id": userId, "ucr.is_deleted": false });

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
  const { userId, companyId } = data;
  if (!userId?.trim() || !companyId?.trim()) {
    return errorResponse("Please provide a valid user ID and company ID");
  }

  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse("Unauthorized");
    }

    const allUserRoles = await knexClient("users_companies_roles as ucr")
      .select("roles.name as roleName", "ucr.company_id as userRoleCompanyId")
      .join("roles", "ucr.role_id", "roles.id")
      .where({
        "ucr.user_id": userId,
        "ucr.is_deleted": false,
      });

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

export const grantAccessToCompany = async ({
  companyId,
  userId,
  roleName,
}: {
  companyId: string;
  userId: string;
  roleName: RoleName;
}): Promise<ApiResponse<null>> => {
  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse("Unauthorized");
    }

    const company = await knexClient("companies")
      .select("id", "is_demo_company")
      .where("id", companyUUID)
      .first();

    if (!company) {
      return errorResponse("Company not found");
    }

    console.log(company);

    // === DEMO COMPANY HANDLING ===
    // If this is a demo company:
    // - Anyone can request access without prior authorization
    // - We always assign the 'demo_user' role (no custom roles allowed)
    // - We skip any granter validation (speed and simplicity)

    const resolvedRole = company.is_demo_company ? "demo_user" : roleName;

    const roleId = getRoleId(resolvedRole);
    if (!roleId) {
      return errorResponse("Unable to resolve role");
    }

    const existingAccess = await knexClient("users_companies_roles")
      .where({
        user_id: userId,
        company_id: company.id,
      })
      .first();

    if (existingAccess) {
      return successResponse("User already has access", null);
    }

    if (company.is_demo_company) {
      const res = await knexClient("users_companies_roles")
        .insert({
          user_id: userId,
          company_id: company.id,
          role_id: roleId,
        })
        .onConflict(["user_id", "company_id"])
        .ignore();

      console.log(res);
      return successResponse("Access granted", null);
    }

    // === NON-DEMO COMPANIES ===
    // Not implemented for now — fast path for demo companies only

    // granter: Who is granting access? Does he/she even have access to the company... don't bother if it's demo company
    // Who are we granting access to? Self or another? We identify them by email or id,
    // If the granter is not support or super admin, they cannot assign any role, if

    return errorResponse(
      "Granting access to non-demo companies is not supported yet"
    );
  } catch (error) {
    return errorResponse("Failed to grant access");
  }
};
