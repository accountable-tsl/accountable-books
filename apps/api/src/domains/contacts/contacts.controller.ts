import { type Response } from 'express';

import { type AuthRequest } from '../../features/auth/auth.types.js';
import {
  errorResponse,
  getHttpStatusFromErrorCode,
} from '../../shared/utils/response.utils.js';
// Contact resolution retired (v1) — review service import + controllers disabled.
/*
import {
  confirmContactResolution,
  createContactFromObservedCounterparty,
  deleteContactAlias,
  getContactAliases,
  getContactResolutionReviewQueue,
  ignoreObservedCounterparty,
  linkObservedCounterpartyToContact,
  reassignContactAlias,
  rejectInferredContact,
} from './contact-resolution-review.service.js';
*/
import {
  addNewContacts,
  deleteContact,
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

export async function deleteContactController(req: AuthRequest, res: Response) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const id = String(req.params.contactId);

    if (!userId || !companyId || !id) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const result = await deleteContact({
      companyId,
      input: { id },
      userId,
    });

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

// Contact resolution retired (v1) — review controllers disabled below.
/*
export async function getContactResolutionReviewQueueController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = String(req.params.companyId);

    const result = await getContactResolutionReviewQueue({
      companyId,
      ...(req.body || {}),
    });

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function confirmContactResolutionController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = req.user?.id;
    const companyId = String(req.params.companyId);
    if (!userId) return res.status(401).json(errorResponse('Unauthorized'));

    const result = await confirmContactResolution({
      companyId,
      userId,
      input: req.body || {},
    });

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function linkObservedCounterpartyToContactController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = req.user?.id;
    const companyId = String(req.params.companyId);
    if (!userId) return res.status(401).json(errorResponse('Unauthorized'));

    const result = await linkObservedCounterpartyToContact({
      companyId,
      userId,
      input: req.body || {},
    });

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function createContactFromObservedCounterpartyController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = req.user?.id;
    const companyId = String(req.params.companyId);
    if (!userId) return res.status(401).json(errorResponse('Unauthorized'));

    const result = await createContactFromObservedCounterparty({
      companyId,
      userId,
      input: req.body || {},
    });

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function ignoreObservedCounterpartyController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = req.user?.id;
    const companyId = String(req.params.companyId);
    if (!userId) return res.status(401).json(errorResponse('Unauthorized'));

    const result = await ignoreObservedCounterparty({
      companyId,
      userId,
      input: req.body || {},
    });

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function rejectInferredContactController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = req.user?.id;
    const companyId = String(req.params.companyId);
    if (!userId) return res.status(401).json(errorResponse('Unauthorized'));

    const result = await rejectInferredContact({
      companyId,
      userId,
      input: req.body || {},
    });

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function getContactAliasesController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = String(req.params.companyId);
    const result = await getContactAliases({
      companyId,
      input: req.body || {},
    });

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function reassignContactAliasController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = req.user?.id;
    const companyId = String(req.params.companyId);
    const aliasId = String(req.params.aliasId);
    if (!userId) return res.status(401).json(errorResponse('Unauthorized'));

    const result = await reassignContactAlias({
      companyId,
      userId,
      aliasId,
      input: req.body || {},
    });

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function deleteContactAliasController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = req.user?.id;
    const companyId = String(req.params.companyId);
    const aliasId = String(req.params.aliasId);
    if (!userId) return res.status(401).json(errorResponse('Unauthorized'));

    const result = await deleteContactAlias({
      companyId,
      userId,
      aliasId,
    });

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}
*/
