import { type Request, type Response } from 'express';
import { errorResponse } from '../../shared/utils/response.utils.js';
import { registerNewAccount } from './signup.service.js';

export const clientSignup = async (req: Request, res: Response) => {
  try {
    const newUser = await registerNewAccount(req.body.data);
    if (newUser.success) {
      return res.status(201).json(newUser);
    } else {
      return res.status(400).json(newUser);
    }
  } catch (error: any) {
    res.status(500).json(errorResponse('An unexpected error occurred', error));
  }
};
