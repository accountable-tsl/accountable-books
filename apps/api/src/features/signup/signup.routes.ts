import express from 'express';

import { authLimiter } from '../../core/middlewares/rateLimiter.middleware.js';
import { clientSignup } from './signup.controller.js';

const router = express.Router({ mergeParams: true });

router.post('/signup', authLimiter, clientSignup);

export default router;
