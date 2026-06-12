import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import {
  addContactsController,
  confirmContactResolutionController,
  createContactFromObservedCounterpartyController,
  deleteContactAliasController,
  deleteContactController,
  getContactAliasesController,
  getContactResolutionReviewQueueController,
  getContactsController,
  ignoreObservedCounterpartyController,
  linkObservedCounterpartyToContactController,
  reassignContactAliasController,
  rejectInferredContactController,
  updateContactsController,
} from './contacts.controller.js';

const router = express.Router({ mergeParams: true });

router.use(checkCompanyId);

router.post('/resolutions/query', getContactResolutionReviewQueueController);
router.post('/resolutions/confirm', confirmContactResolutionController);
router.post(
  '/resolutions/link-observed',
  linkObservedCounterpartyToContactController,
);
router.post(
  '/resolutions/create-contact',
  createContactFromObservedCounterpartyController,
);
router.post(
  '/resolutions/ignore-observed',
  ignoreObservedCounterpartyController,
);
router.post(
  '/resolutions/reject-inferred-contact',
  rejectInferredContactController,
);
router.post('/aliases/query', getContactAliasesController);
router.patch('/aliases/:aliasId/reassign', reassignContactAliasController);
router.delete('/aliases/:aliasId', deleteContactAliasController);
router.post('/query', getContactsController);
router.post('/', addContactsController);
router.patch('/', updateContactsController);
router.delete('/:contactId', deleteContactController);

export default router;
