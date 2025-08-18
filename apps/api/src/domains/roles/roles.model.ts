import { knexClient } from '../../db/knexClient.js';
import { AppError } from '../../shared/utils/response.utils.js';
import { type RoleInfo, roleKey, type RoleKey } from './roles.types.js';

let rolesLoaded = false;

export const roles: Record<RoleKey, RoleInfo> = Object.fromEntries(
  roleKey.options.map((key) => [key, { id: '', name: '', description: '' }]),
) as Record<RoleKey, RoleInfo>;

export const loadRoles = async () => {
  if (rolesLoaded) return;

  const result = await knexClient('roles')
    .select('id', 'key', 'name', 'description')
    .where('is_deleted', false);

  for (const role of result) {
    if (roleKey.options.includes(role.key)) {
      roles[role.key as RoleKey] = {
        id: String(role.id),
        name: role.name,
        description: role.description,
      };
    } else {
      console.warn(`Unknown role key in DB: ${role.key}`);
    }
  }

  // Validate all required roles are loaded
  for (const role of roleKey.options) {
    if (!roles[role].id) {
      throw new AppError(`Missing critical role: ${role}`);
    }
  }

  rolesLoaded = true;
};

export const isRolesLoaded = () => rolesLoaded;

export async function getRoleId(key: RoleKey): Promise<string> {
  const allRolesLoaded = isRolesLoaded();
  if (!allRolesLoaded) await loadRoles();

  if (!rolesLoaded) {
    throw new AppError('Roles not loaded yet! Call loadRoles() at startup.');
  }

  return roles[key].id;
}

export function getRoleDetails(key: RoleKey): RoleInfo {
  if (!rolesLoaded) {
    throw new AppError('Roles not loaded yet! Call loadRoles() at startup.');
  }
  return roles[key];
}
