import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import { grantAccessToCompanyController } from './user-roles.controller.js';

const router = express.Router({ mergeParams: true });

router.post('/grant-access', checkCompanyId, grantAccessToCompanyController);
export default router;
