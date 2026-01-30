import express from 'express';

import {
  getJournalController,
  getJournalsByCursorController,
  getJournalsByPageController,
  postJournalController,
} from './journals.controller.js';

const router = express.Router({ mergeParams: true });

router.post('/query', getJournalsByPageController);
router.post('/query/cursor', getJournalsByCursorController);
router.post('/', postJournalController);
router.get('/:journalId', getJournalController);

export default router;
