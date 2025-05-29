import knex from "../../../knexClient";
import { errorResponse } from "../../shared/utils/response.utils";

export async function getPermissionsForRole(roleId: string) {
  const results = await knex("roles_permissions")
    .join("permissions", "roles_permissions.permission_id", "permission.id")
    .where("roles_permissions.role_id", roleId);
}
