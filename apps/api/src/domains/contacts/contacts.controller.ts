import { type Response } from 'express';

import { type AuthRequest } from '../../features/auth/auth.types.js';
import { errorResponse } from '../../shared/utils/response.utils.js';
import {
  addNewContacts,
  getContacts,
  updateContacts,
} from './contacts.model.js';

export async function getContactsController(req: AuthRequest, res: Response) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const filters = req.body || {};

    if (!userId || !companyId)
      return res.status(400).json(errorResponse('Bad Request'));

    const result = await getContacts({
      companyId,
      ...filters,
    });

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function addContactsController(req: AuthRequest, res: Response) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const data = Array.isArray(req.body) ? req.body : [req.body];

    if (!userId || !companyId)
      return res.status(400).json(errorResponse('Bad Request'));

    const result = await addNewContacts({ companyId, input: data, userId });
    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function updateContactsController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);

    if (!userId || !companyId)
      return res.status(400).json(errorResponse('Bad Request'));

    const result = await updateContacts({
      companyId,
      updates: req.body,
      userId,
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}
