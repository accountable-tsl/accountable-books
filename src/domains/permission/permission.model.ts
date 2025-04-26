import knex from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import {
  ensure,
  errorResponse,
  successResponse,
  throwError,
} from "../../shared/utils/response.utils";

export async function getPermissionsForRole(
  roleId: string
): Promise<ApiResponse> {
  try {
    const results = await knex("roles_permissions")
      .join("permissions", "roles_permissions.permission_id", "permissions.id")
      .where("roles_permissions.role_id", roleId)
      .select("permissions.key as permission");

    ensure(results.length, "No permissions found for role");

    return successResponse("Permissions retrieved", results);
  } catch (error) {
    return errorResponse("Failed to fetch permissions");
  }
}
