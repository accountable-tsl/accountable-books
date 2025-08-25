import express from 'express';
import { clientSignup } from './signup.controller.js';
import { authLimiter } from '../../core/middlewares/rateLimiter.middleware.js';

const router = express.Router({ mergeParams: true });

router.post('/signup', authLimiter, clientSignup);

export default router;
