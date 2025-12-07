import express from 'express';

import {
  getSettingsController,
  updateSettingsController,
} from './settings.controller.js';

const router = express.Router({ mergeParams: true });

router.get('/', getSettingsController);
router.put('/', updateSettingsController);

export default router;
