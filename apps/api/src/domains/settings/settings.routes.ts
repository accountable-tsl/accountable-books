import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import {
  getSettingsController,
  updateSettingsController,
} from './settings.controller.js';

const router = express.Router({ mergeParams: true });

router.use(checkCompanyId);

router.get('/', getSettingsController);
router.put('/', updateSettingsController);

export default router;
