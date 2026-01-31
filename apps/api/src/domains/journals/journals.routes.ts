import express from 'express';

import {
  getJournalController,
  getJournalsByCursorController,
  getJournalsByPageController,
  postJournalController,
  reverseJournalController,
  voidJournalController,
} from './journals.controller.js';

const router = express.Router({ mergeParams: true });

router.post('/query', getJournalsByPageController);
router.post('/query/cursor', getJournalsByCursorController);
router.post('/', postJournalController);
router.patch('/:journalId/void', voidJournalController);
router.patch('/:journalId/reverse', reverseJournalController);
router.get('/:journalId', getJournalController);

export default router;
