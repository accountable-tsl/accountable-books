import type { Knex } from "knex";
import { RoleName } from "../types/db";

// Role-permission mappings
const rolePermissions: Record<Exclude<RoleName, "super_admin">, string[]> = {
  admin: [
    "users:invite",
    "reports:view",
    "reports:export",
    "company:switch",
    "company:manage",
    "coa:view",
    "coa:update",
    "journals:view",
    "journals:create",
    "journals:update",
    "journals:void",
    "journals:reverse",
    "bank_accounts:view",
    "bank_accounts:link",
    "bank_accounts:upload_csv",
    "transactions:categorize",
    "messages:send",
    "messages:request_files",
    "files:upload",
    "files:download",
    "documents:manage",
  ],
  bookkeeper: [
    "reports:view",
    "reports:export",
    "company:switch",
    "coa:view",
    "coa:update",
    "journals:view",
    "journals:create",
    "journals:update",
    "journals:void",
    "journals:reverse",
    "bank_accounts:view",
    "bank_accounts:upload_csv",
    "transactions:categorize",
    "messages:send",
    "messages:request_files",
    "files:upload",
    "files:download",
    "documents:manage",
  ],
  client: [
    "reports:view",
    "reports:export",
    "company:switch",
    "coa:view",
    "bank_accounts:view",
    "bank_accounts:link",
    "messages:send",
    "files:upload",
    "files:download",
  ],
};

export async function seed(knex: Knex): Promise<void> {
  try {
    // Fetch existing roles and permissions
    const roles = await knex("role").select("id", "name");
    const permissions = await knex("permission").select("id", "key");

    // Map role/permission IDs
    const roleMap = new Map(roles.map((r) => [r.name, r.id]));
    const permissionMap = new Map(permissions.map((p) => [p.key, p.id]));

    // Build role_permission entries
    const entries = Object.entries(rolePermissions).flatMap(
      ([roleName, permKeys]) => {
        const roleId = roleMap.get(roleName as RoleName);
        if (!roleId) {
          console.error(`Role '${roleName}' not found in roleMap`);
          throw new Error(`Invalid role name: '${roleName}'`);
        }

        return permKeys.map((key) => {
          const permissionId = permissionMap.get(key);
          if (!permissionId) {
            console.error(`Permission key '${key}' not found in permissionMap`);
            throw new Error(`Permission ${key} not found`);
          }
          return {
            id: knex.raw("gen_random_uuid()"),
            role_id: roleId,
            permission_id: permissionId,
          };
        });
      }
    );

    // Insert with transaction
    await knex.transaction(async (trx) => {
      await trx("role_permission")
        .insert(entries)
        .onConflict(["role_id", "permission_id"])
        .ignore();
    });

    if (process.env.NODE_ENV === "local" || NODE_ENV === "docker.dev") {
      console.log(`Seeded ${entries.length} role_permission entries`);
    }
  } catch (error) {
    console.error("Error seeding role_permissions:", error);
    throw error;
  }
}
