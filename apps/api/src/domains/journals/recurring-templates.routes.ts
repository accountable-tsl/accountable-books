import express from 'express';

import {
  createRecurringTemplateController,
  deleteRecurringTemplateController,
  getRecurringTemplateController,
  listRecurringTemplatesController,
  previewRecurringTemplateController,
  runRecurringTemplateNowController,
  updateRecurringTemplateController,
  updateRecurringTemplateStatusController,
} from './recurring-templates.controller.js';

const router = express.Router({ mergeParams: true });

router.get('/', listRecurringTemplatesController);
router.post('/', createRecurringTemplateController);
router.post('/preview', previewRecurringTemplateController);
router.patch('/:templateId/status', updateRecurringTemplateStatusController);
router.post('/:templateId/run', runRecurringTemplateNowController);
router.get('/:templateId', getRecurringTemplateController);
router.put('/:templateId', updateRecurringTemplateController);
router.delete('/:templateId', deleteRecurringTemplateController);

export default router;
