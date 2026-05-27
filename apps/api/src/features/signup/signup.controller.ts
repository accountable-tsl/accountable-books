import { type Request, type Response } from 'express';

import { captureProductEvent } from '../../shared/telemetry/capture-product-event.js';
import { ErrorCode, errorResponse } from '../../shared/utils/response.utils.js';
import { registerNewAccount } from './signup.service.js';

export const clientSignup = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.data;
    const user = payload?.user;
    const company = payload?.company;
    if (!user || !company) {
      captureProductEvent('signup.failed', {
        company_type: company?.type,
        error_code: ErrorCode.INVALID_INPUT,
        flow: 'signup',
        step: 'validate_payload',
      });
      return res
        .status(400)
        .json(errorResponse('Missing user or company data'));
    }
    const newUser = await registerNewAccount(payload);
    if (newUser.success) {
      return res.status(201).json(newUser);
    } else {
      return res.status(400).json(newUser);
    }
  } catch (error: any) {
    captureProductEvent('signup.failed', {
      error_code: ErrorCode.GENERIC,
      flow: 'signup',
      step: 'request_handler',
    });
    res.status(500).json(errorResponse('An unexpected error occurred', error));
  }
};
