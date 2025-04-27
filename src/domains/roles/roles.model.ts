import knex from "../../../knexClient";
import { roleName, RoleName } from "../../core/types/db.type";
import { throwError } from "../../shared/utils/response.utils";

let rolesLoaded = false;

export const roles: Record<RoleName, string> = {
  super_admin: "",
  admin: "",
  bookkeeper: "",
  client: "",
};
export const loadRoles = async () => {
  const result = await knex("roles")
    .select("id", "name")
    .where("is_deleted", false);

  for (const role of result) {
    if (roleName.options.includes(role.name)) {
      roles[role.name as RoleName] = role.id;
    }
  }

  // Validate all required roles are loaded
  for (const role of roleName.options) {
    if (!roles[role]) {
      throwError(`Missing critical role: ${roleName}`);
    }
  }

  rolesLoaded = true;
  console.log("Loaded role IDs:", roles);
};

export function getRoleId(name: RoleName): string {
  if (!rolesLoaded) {
    throwError("Roles not loaded yet! Call loadRoles() at startup.");
  }
  return roles[name];
}
