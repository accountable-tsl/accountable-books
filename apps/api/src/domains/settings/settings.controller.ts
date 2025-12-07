import { type Response } from 'express';

import { type AuthRequest } from '../../features/auth/auth.types.js';
import { errorResponse } from '../../shared/utils/response.utils.js';
import { type SettingKey } from './settings.registry.js';
import { getCompanySetting, setCompanySettings } from './settings.service.js';

/**
 * GET /api/:companyId/settings
 * Query params: ?keys=key1,key2 (optional, comma-separated)
 */
export async function getSettingsController(req: AuthRequest, res: Response) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const keysParam = req.query.keys as string | undefined;

    if (!userId || !companyId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    // Parse keys if provided
    const settingKeys = keysParam
      ? (keysParam.split(',').map((k) => k.trim()) as SettingKey[])
      : undefined;

    const result = settingKeys
      ? await getCompanySetting({ companyId, settingKeys })
      : await getCompanySetting({ companyId });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

/**
 * PUT /api/:companyId/settings
 * Body: { settings: [{ key: string, value: any, description?: string }] }
 */
export async function updateSettingsController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const { settings } = req.body;

    if (!userId || !companyId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    if (!Array.isArray(settings) || settings.length === 0) {
      return res
        .status(400)
        .json(
          errorResponse('Request body must contain a non-empty settings array'),
        );
    }

    const result = await setCompanySettings({
      companyId,
      settings,
      userId,
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}
