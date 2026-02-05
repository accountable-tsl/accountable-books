import type { Response } from 'express';

import { type AuthRequest } from '../../features/auth/auth.types.js';
import { errorResponse } from '../../shared/utils/response.utils.js';
import {
  createRecurringTemplate,
  getRecurringTemplate,
  listRecurringTemplates,
  previewRecurringTemplate,
  runRecurringTemplateNow,
  updateRecurringTemplate,
  updateRecurringTemplateStatus,
} from './recurring-templates.model.js';

export async function listRecurringTemplatesController(
  req: AuthRequest,
  res: Response,
) {
  try {
    if (!req.user?.id || !req.params.companyId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const companyId = String(req.params.companyId);
    const queryData = req.query || {};

    const result = await listRecurringTemplates({
      companyId,
      queryData,
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function getRecurringTemplateController(
  req: AuthRequest,
  res: Response,
) {
  try {
    if (!req.user?.id || !req.params.companyId || !req.params.templateId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const companyId = String(req.params.companyId);
    const templateId = String(req.params.templateId);

    const result = await getRecurringTemplate({ companyId, templateId });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function createRecurringTemplateController(
  req: AuthRequest,
  res: Response,
) {
  try {
    if (!req.user?.id || !req.params.companyId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const companyId = String(req.params.companyId);
    const userId = String(req.user.id);

    const result = await createRecurringTemplate({
      companyId,
      userId,
      input: req.body ?? {},
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function updateRecurringTemplateController(
  req: AuthRequest,
  res: Response,
) {
  try {
    if (!req.user?.id || !req.params.companyId || !req.params.templateId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const companyId = String(req.params.companyId);
    const userId = String(req.user.id);
    const templateId = String(req.params.templateId);

    const result = await updateRecurringTemplate({
      companyId,
      userId,
      templateId,
      input: req.body ?? {},
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function updateRecurringTemplateStatusController(
  req: AuthRequest,
  res: Response,
) {
  try {
    if (!req.user?.id || !req.params.companyId || !req.params.templateId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const companyId = String(req.params.companyId);
    const templateId = String(req.params.templateId);

    const result = await updateRecurringTemplateStatus({
      companyId,
      templateId,
      input: req.body ?? {},
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function previewRecurringTemplateController(
  req: AuthRequest,
  res: Response,
) {
  try {
    if (!req.user?.id || !req.params.companyId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const companyId = String(req.params.companyId);

    const result = await previewRecurringTemplate({
      companyId,
      input: req.body ?? {},
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function runRecurringTemplateNowController(
  req: AuthRequest,
  res: Response,
) {
  try {
    if (!req.user?.id || !req.params.companyId || !req.params.templateId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const companyId = String(req.params.companyId);
    const templateId = String(req.params.templateId);
    const userId = String(req.user.id);

    const result = await runRecurringTemplateNow({
      companyId,
      templateId,
      userId,
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}
