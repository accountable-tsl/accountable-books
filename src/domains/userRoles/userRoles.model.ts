import type { Knex } from "knex";
import { knexClient } from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import {
  getCompanyShortCode,
  getCompanyUUID,
} from "../../shared/utils/random.utils";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { getRoleId, roles } from "../roles/roles.model";
import {
  AccessibleCompanies,
  AccessibleCompaniesResponse,
  GrantAccessResponse,
  GrantAccessToFirmClient,
  GrantDirectAccess,
  UserCompanyRoleAssignmentRes,
} from "./userRoles.types";
import {
  RoleKey,
  roleKey,
  RoleScope,
  roleScope as roleScopeEnum,
} from "../roles/roles.types";

const getUserCompanyRoleAssignments = async (
  userId: string,
  trx?: Knex.Transaction
): Promise<ApiResponse<UserCompanyRoleAssignmentRes[]>> => {
  if (!userId?.trim()) {
    return errorResponse("Please provide a valid user ID");
  }

  const knex = trx || knexClient;

  try {
    // Query 1: Get direct company roles
    // This fetches roles where the user is directly assigned to a company
    // (both accounting firms and client companies)
    const directRoles = knex("user_company_roles as ucr")
      .join("roles as r", "ucr.role_id", "r.id")
      .join("companies as c", "ucr.company_id", "c.id")
      .leftJoin(
        "accounting_firms_meta as af",
        "c.assigned_firm_id",
        "af.company_id"
      )
      .where({ "ucr.user_id": userId, "ucr.is_deleted": false })
      .select(
        "ucr.user_id as userId",
        "c.short_code as companyId",
        "af.slug as firmSlug",
        "r.id as roleId",
        "r.key as roleKey",
        "r.name as roleName",
        "r.scope as roleScope"
      );

    // Query 2: Get roles via firm-client assignments
    // This fetches roles where:
    // 1. User is staff at an accounting firm (has role in user_company_roles)
    // 2. That firm is assigned to client companies (client_firm_assignments)
    // 3. The user is specifically assigned to work on those clients (firm_user_client_assignments)
    // Result: User gets their firm role applied to the assigned client companies
    const rolesViaFirmAssignments = knex("firm_user_client_assignments as fuca")
      .join("companies as c", "fuca.client_company_id", "c.id")
      .join(
        "client_firm_assignments as cfa",
        "fuca.client_company_id",
        "cfa.client_company_id"
      )
      .join("user_company_roles as ucr", function () {
        // Critical join: ensure user's role is at the firm assigned to this client
        this.on("ucr.user_id", "fuca.firm_staff_user_id") // User matches
          .andOn("ucr.company_id", "cfa.accounting_firm_company_id"); // Role is at the assigned firm
      })
      .leftJoin(
        "accounting_firms_meta as af",
        "c.assigned_firm_id",
        "af.company_id"
      )
      .join("roles as r", "ucr.role_id", "r.id")
      .where({
        "fuca.firm_staff_user_id": userId,
        "fuca.is_deleted": false,
        "ucr.is_deleted": false,
      })
      .select(
        "fuca.firm_staff_user_id as userId",
        "c.short_code as companyId",
        "af.slug as firmSlug",
        "r.id as roleId",
        "r.key as roleKey",
        "r.name as roleName",
        "r.scope as roleScope"
      );

    // Combine both direct roles and firm-assigned roles
    // Using UNION ALL to get all roles (direct + via firm assignments)
    const allRoles = await knex.union(
      [directRoles, rolesViaFirmAssignments],
      true // UNION ALL (allows duplicates, though unlikely in this case)
    );

    if (!allRoles.length) {
      return errorResponse("User is not assigned to any company");
    }

    const result: UserRoleResponse[] = allRoles.map((r) => ({
      userId: r.userId,
      companyId: r.companyId,
      firmSlug: r.firmSlug,
      roleId: r.roleId,
      roleKey: r.roleKey as RoleKey,
      roleName: r.roleName,
      roleScope: r.roleScope as RoleScope,
    }));

    return successResponse("Successfully fetched user roles", result);
  } catch (error) {
    return errorResponse("Failed to fetch user roles", error);
  }
};

/**
 * Given a user ID, return an array of companies that the user has access to,
 * along with the highest platform role the user has been assigned, if any.
 *
 * @param userId - The ID of the user to query
 * @param trx - An optional transaction to use (e.g. for batching user queries)
 *
 * @returns An array of AccessibleCompanies objects, plus a highestPlatformKey
 * property if the user has a platform role assignment.
 *
 * The AccessibleCompanies array contains objects with the following properties:
 * - companyId: The ID of the company the user has access to
 * - firmSlug: The slug of the accounting firm the company belongs to
 * - roleKey: The role key the user has been assigned for this company
 * - roleScope: The role scope the user has been assigned for this company
 * - hasExplicitAccess: Whether the user has an explicit role assignment for this company
 * - isDemoCompany: Whether the company is a demo company
 */
export const getAccessibleCompaniesForUser = async ({
  userId,
  trx,
}: {
  userId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<AccessibleCompaniesResponse>> => {
  const knex = trx || knexClient;
  try {
    const rolesResponse = await getUserCompanyRoleAssignments(userId, trx);
    const userRoles =
      rolesResponse.success && rolesResponse.data ? rolesResponse.data : [];

    const mappedUserCompanies: AccessibleCompanies[] = userRoles.map((r) => ({
      isDemoCompany: false,
      hasExplicitAccess: true,
      companyId: r.companyId,
      firmSlug: r.firmSlug,
      roleKey: r.roleKey,
      roleScope: r.roleScope,
    }));

    const knownCompanyIds = userRoles.map((r) => r.companyId);
    const demoCompanies = await knex("companies as c")
      .join("accounting_firms_meta as af", "c.id", "af.company_id")
      .select(
        "c.display_name as companyName",
        "c.short_code as companyId",
        "af.slug as firmSlug"
      )
      .where("is_demo_company", true)
      .whereNotIn("c.short_code", knownCompanyIds);

    const mappedDemoCompanies = demoCompanies.map((c) => ({
      isDemoCompany: true,
      hasExplicitAccess: false,
      companyId: c.companyId,
      firmSlug: c.firmSlug,
      roleKey: null,
      roleScope: null,
    })) as AccessibleCompanies[];

    const platformRoleHierarchy = [
      roleKey.enum.super_admin,
      roleKey.enum.support_admin,
      roleKey.enum.support_agent,
    ] as RoleKey[];

    const platformRoleAssignments = userRoles.filter(
      (r) => r.roleScope === roleScopeEnum.enum.platform
    );

    const highestPlatformKey =
      platformRoleAssignments
        .map((r) => r.roleKey)
        .find((roleKey) => platformRoleHierarchy.includes(roleKey)) || null;

    const accessibleCompanies = [
      ...mappedUserCompanies,
      ...mappedDemoCompanies,
    ];

    if (!accessibleCompanies.length && !highestPlatformKey) {
      return errorResponse("User has no access to any company");
    }

    return successResponse("User has access to these companies", {
      ...(highestPlatformKey
        ? {
            isPlatformUser: !!highestPlatformKey,
            platformUserKey: highestPlatformKey,
          }
        : {}),
      accessibleCompanies,
    });
  } catch (error) {
    return errorResponse("Internal server error", error);
  }
};

/**
 * Helper function to check if a user has access to a specific company
 * Determines if a user has access to a specific company and provides details about the access.
 *
 * @param {object} params - The function parameters.
 * @param {string} params.companyId - The identifier of the company to check access for.
 * @param {AccessibleCompaniesResponse} params.userContext - The user's context including accessible companies and platform roles from getAccessibleCompaniesForUser.
 *
 * @returns {Promise<{ hasAccess: boolean, roleKey: RoleKey | null, roleScope: RoleScope | null, accessReason: string }>}
 * - `hasAccess`: Indicates whether the user has access to the specified company.
 * - `roleKey`: The key of the role the user has within the company or platform, if any.
 * - `roleScope`: The scope of the role, either company-specific or platform-wide.
 * - `accessReason`: The reason for access, which can be "demo", "explicit", "platform", or "none".
 */
export const hasAccessToCompany = async ({
  companyId: companyIdentifier,
  userContext,
}: {
  companyId: string;
  userContext: AccessibleCompaniesResponse;
}): Promise<{
  hasAccess: boolean;
  roleKey: RoleKey | null;
  roleScope: RoleScope | null;
  accessReason: string;
}> => {
  const companyId = await getCompanyShortCode(companyIdentifier); // for backend only

  const { isPlatformUser, platformUserKey, accessibleCompanies } = userContext;
  const company = accessibleCompanies.find((c) => c.companyId === companyId);

  const hasAccess = !!company || !!isPlatformUser;

  const roleKey =
    company?.roleKey || (isPlatformUser ? platformUserKey : null) || null;
  const roleScope =
    company?.roleScope || (isPlatformUser ? roleScopeEnum.enum.platform : null);

  const accessReason = company
    ? company.isDemoCompany
      ? "demo"
      : "explicit"
    : isPlatformUser
      ? "platform"
      : "none";

  return { hasAccess, roleKey, roleScope, accessReason };
};



export const grantDirectAccess = async ({
  knex,
  userId,
  companyId: inputedCompanyId,
  roleKey,
  grantedBy,
}: GrantDirectAccess): Promise<ApiResponse<GrantAccessResponse>> => {
  try {
    const companyId = await getCompanyUUID(inputedCompanyId);
    if (!companyId) return errorResponse("Company not found");

    const userExists = await knex("users").where("id", userId).first();
    if (!userExists) return errorResponse("User not found");

    const roleId = getRoleId(roleKey);
    if (!roleId) return errorResponse(`Role '${roleKey}' not found`);

    // Check if user already has a role at this company
    const existingRole = await knex("user_company_roles")
      .where({
        user_id: userId,
        company_id: companyId,
        is_deleted: false,
      })
      .first();

    let result;
    const timestamp = new Date();

    if (existingRole) {
      // Check if the role is actually changing
      if (existingRole.role_id === roleId) {
        return successResponse("User already has this role at the company", {
          action: "no_change",
        });
      }

      // Update existing role
      result = await knex("user_company_roles")
        .where({
          user_id: userId,
          company_id: companyId,
          is_deleted: false,
        })
        .update({
          role_id: roleId,
          updated_by_id: grantedBy,
          updated_at: timestamp,
        });

      return successResponse("User role updated successfully", {
        action: "updated",
      });
    } else {
      // Insert new role
      result = await knex("user_company_roles").insert({
        user_id: userId,
        company_id: companyId,
        role_id: roleId,
        created_by_id: grantedBy,
        updated_by_id: grantedBy,
      });

      return successResponse("User role granted successfully", {
        action: "created",
      });
    }
  } catch (error) {
    return errorResponse("Failed to grant direct access", error);
  }
};

export const grantAccessToFirmClient = async ({
  knex,
  firmId,
  clientCompanyId,
  userId,
  grantedBy,
  roleKey,
}: GrantAccessToFirmClient): Promise<ApiResponse<GrantAccessResponse>> => {
  try {
    const companyId = await getCompanyUUID(clientCompanyId);
    if (!companyId) return errorResponse("Company not found");

    const userExists = await knex("users").where("id", userId).first();
    if (!userExists) return errorResponse("User not found");

    const roleId = getRoleId(roleKey);
    if (!roleId) return errorResponse(`Role '${roleKey}' not found`);

    // Check if the granter (grantedBy) is firm staff
    const granterIsFirmStaff = await knex("user_company_roles as ucr")
      .where({
        "ucr.user_id": grantedBy,
        "ucr.company_id": firmId,
        "ucr.is_deleted": false,
      })
      .first();

    if (!granterIsFirmStaff)
      return errorResponse("Granter is not a firm staff");

    // Verify grantee (firm staff) is part of the firm
    const granteeIsFirmStaff = await knex("user_company_roles as ucr")
      .where({
        "ucr.user_id": userId,
        "ucr.company_id": firmId,
        "ucr.is_deleted": false,
      })
      .first();

    if (!granteeIsFirmStaff)
      return errorResponse("User to be granted is not a firm staff");

    // Verify the client company is assigned to this firm
    const clientAssigned = await knex("client_firm_assignments as cfa")
      .where({
        "cfa.client_company_id": companyId,
        "cfa.accounting_firm_company_id": firmId,
        "cfa.is_deleted": false,
      })
      .first();

    if (!clientAssigned)
      return errorResponse("Client is not assigned to this firm");

    // Grant the role
    const existingAccess = await knex("firm_user_client_assignments as fuca")
      .where({
        "fuca.firm_staff_user_id": userId,
        "fuca.client_company_id": companyId,
        "fuca.is_deleted": false,
      })
      .first();

    if (existingAccess) {
      return successResponse("User already has access to this client", {
        action: "no_change",
      });
    }

    await knex("firm_user_client_assignments").insert({
      firm_staff_user_id: userId,
      client_company_id: companyId,
      created_by_id: grantedBy,
      updated_by_id: grantedBy,
    });

    return successResponse("Access granted successfully", {
      action: "created",
    });
  } catch (error) {
    return errorResponse("Failed to grant firm client access", error);
  }
};
