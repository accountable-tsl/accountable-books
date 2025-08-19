import { knexClient } from '../../db/knexClient.js';
import type { ApiResponse } from '../../core/types/api.types.js';
import { AppError, errorResponse, successResponse } from '../../shared/utils/response.utils.js';

export async function getPermissionsForRole(roleId: string): Promise<ApiResponse> {
  try {
    const results = await knexClient('roles_permissions')
      .join('permissions', 'roles_permissions.permission_id', 'permissions.id')
      .where('roles_permissions.role_id', roleId)
      .select('permissions.key as permission');

    if (!results.length) throw new AppError('No permissions found for role');

    return successResponse('Permissions retrieved', results);
  } catch (error: unknown) {
    return errorResponse('Failed to fetch permissions', error);
  }
}
