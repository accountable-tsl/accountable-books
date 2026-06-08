import { type Response } from 'express';

import {
  ErrorCode,
  errorResponse,
  getHttpStatusFromErrorCode,
} from '../../shared/utils/response.utils.js';
import {
  executeCoaLifecycle,
  preflightCoaLifecycle,
} from './coa-lifecycle.service.js';
import {
  createCoa,
  editCoa,
  fetchCompanyCoa,
  unarchiveCoa,
} from './coa.model.js';
import { coaUpdateInput } from './coa.types.js';

import type { AuthRequest } from '../../features/auth/auth.types.js';
import type {
  CoaLifecycleExecuteInput,
  CoaLifecyclePreflightInput,
  CoaUpdateInput,
} from './coa.types.js';

export const createCoaController = async (req: AuthRequest, res: Response) => {
  try {
    const companyId = String(req.params.companyId);
    const userId = req.user?.id;
    const data = Array.isArray(req.body) ? req.body : [req.body];

    if (!companyId || !userId) {
      return res.status(400).json(errorResponse('Unauthorized'));
    }

    const response = await createCoa({ companyId, userId, data });
    return res
      .status(
        response.success ? 200 : getHttpStatusFromErrorCode(response.code),
      )
      .json(response);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
};

export const getCoaController = async (req: AuthRequest, res: Response) => {
  const {
    companyId: companyIdFromQuery,
    id,
    code,
    active,
    key,
    includeDeleted,
  } = req.query;
  const companyId = companyIdFromQuery || req.params.companyId;
  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json(errorResponse('Missing or invalid companyId'));
  }

  try {
    const result = await fetchCompanyCoa({
      companyId,
      ...(id ? { id: String(id) } : {}),
      ...(code ? { code: String(code) } : {}),
      ...(active
        ? {
            active:
              active === 'true' ? true : active === 'false' ? false : undefined,
          }
        : {}),
      ...(key ? { accountTypeKey: String(key) } : {}),
      ...(includeDeleted
        ? { includeDeleted: includeDeleted === 'true' ? true : false }
        : {}),
    });

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('An unexpected error occurred', error));
  }
};

// Edit a single COA record
export const editCoaController = async (req: AuthRequest, res: Response) => {
  const obj = coaUpdatePreChecks(req, res);
  if (typeof obj === 'string') {
    return res.status(400).json(errorResponse(obj));
  }

  try {
    const result = await editCoa(obj);

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('An unexpected error occurred', error));
  }
};

export const deleteCoaController = async (req: AuthRequest, res: Response) => {
  const obj = coaUpdatePreChecks(req, res);
  if (typeof obj === 'string') {
    return res.status(400).json(errorResponse(obj));
  }
  const { updates, ...rest } = obj;

  try {
    const result = await executeLegacyLifecycleWithoutReferences({
      ...rest,
      operation: 'delete',
      accountIds: updates.map(({ id }) => id),
    });

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('An unexpected error occurred', error));
  }
};

export const archiveCoaController = async (req: AuthRequest, res: Response) => {
  const obj = coaUpdatePreChecks(req, res);
  if (typeof obj === 'string') {
    return res.status(400).json(errorResponse(obj));
  }
  const { updates, ...rest } = obj;

  try {
    const result = await executeLegacyLifecycleWithoutReferences({
      ...rest,
      operation: 'archive',
      accountIds: updates.map(({ id }) => id),
    });

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('An unexpected error occurred', error));
  }
};

async function executeLegacyLifecycleWithoutReferences({
  companyId,
  userId,
  operation,
  accountIds,
}: {
  companyId: string;
  userId: string;
  operation: 'archive' | 'delete';
  accountIds: string[];
}) {
  const preflight = await preflightCoaLifecycle({
    companyId,
    data: { operation, accountIds },
  });
  if (!preflight.success || !preflight.data) return preflight;

  if (!preflight.data.canExecuteWithoutResolution) {
    return errorResponse(
      'Chart of accounts lifecycle operation requires explicit reference resolution',
      { preflight: preflight.data },
      { code: ErrorCode.OPERATION_NOT_ALLOWED },
    );
  }

  return executeCoaLifecycle({
    companyId,
    userId,
    data: {
      operation,
      accountIds,
      impactFingerprint: preflight.data.impactFingerprint,
      resolutions: [],
    },
  });
}

// Bulk unarchive COA records
export const unarchiveCoaController = async (
  req: AuthRequest,
  res: Response,
) => {
  const obj = coaUpdatePreChecks(req, res);
  if (typeof obj === 'string') {
    return res.status(400).json(errorResponse(obj));
  }
  const { updates, ...rest } = obj;

  try {
    const result = await unarchiveCoa({
      ...rest,
      accountIds: updates.map(({ id }) => id),
    });

    return res
      .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
      .json(result);
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('An unexpected error occurred', error));
  }
};

export const preflightCoaLifecycleController = async (
  req: AuthRequest,
  res: Response,
) => {
  const companyId = String(req.params.companyId);
  const result = await preflightCoaLifecycle({
    companyId,
    data: req.body as CoaLifecyclePreflightInput,
  });
  return res
    .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
    .json(result);
};

export const executeCoaLifecycleController = async (
  req: AuthRequest,
  res: Response,
) => {
  const companyId = String(req.params.companyId);
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json(errorResponse('Unauthorized'));
  }

  const result = await executeCoaLifecycle({
    companyId,
    userId,
    data: req.body as CoaLifecycleExecuteInput,
  });
  return res
    .status(result.success ? 200 : getHttpStatusFromErrorCode(result.code))
    .json(result);
};

function coaUpdatePreChecks(
  req: AuthRequest,
  res: Response,
):
  | {
      updates: CoaUpdateInput[];
      companyId: string;
      userId: string;
    }
  | string {
  const companyId = String(req.params.companyId);
  const userId = req.user?.id;

  if (!companyId || !userId) return 'Missing valid authorization details';

  const data = Array.isArray(req.body) ? req.body : [req.body];
  const validateData = coaUpdateInput.array().safeParse(data);
  if (!validateData.success) {
    return validateData.error.message;
  }
  return {
    companyId,
    userId,
    updates: validateData.data,
  };
}
