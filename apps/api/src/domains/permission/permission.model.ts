import { knexClient } from '../../db/knexClient.js';
import {
  AppError,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';

import type { ApiResponse } from '../../core/types/api.types.js';

export async function getPermissionsForRole(
  roleId: string,
): Promise<ApiResponse> {
  try {
    const results = await knexClient('app.role_permissions')
      .join(
        'app.permissions',
        'app.role_permissions.permission_id',
        'app.permissions.id',
      )
      .where('app.role_permissions.role_id', roleId)
      .select('app.permissions.key as permission');

    if (!results.length) throw new AppError('No permissions found for role');

    return successResponse('Permissions retrieved', results);
  } catch (error: unknown) {
    return errorResponse('Failed to fetch permissions', error);
  }
}
