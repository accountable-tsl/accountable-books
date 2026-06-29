import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import {
  addContactsController,
  deleteContactController,
  getContactsController,
  updateContactsController,
} from './contacts.controller.js';

const router = express.Router({ mergeParams: true });

router.use(checkCompanyId);

router.post('/query', getContactsController);
router.post('/', addContactsController);
router.patch('/', updateContactsController);
router.delete('/:contactId', deleteContactController);

export default router;
