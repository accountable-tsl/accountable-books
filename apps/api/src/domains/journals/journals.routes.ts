import express from 'express';

import { getPeriodStatusController } from '../reporting/fiscal-calendar/period-status.controller.js';
import {
  copyJournalController,
  getJournalController,
  getJournalsByCursorController,
  getJournalsByPageController,
  postDraftJournalController,
  postDraftJournalsBatchController,
  postJournalController,
  reverseJournalController,
  updateDraftJournalController,
  voidDraftJournalController,
  voidDraftJournalsBatchController,
} from './journals.controller.js';

const router = express.Router({ mergeParams: true });

router.post('/query', getJournalsByPageController);
router.post('/query/cursor', getJournalsByCursorController);
router.post('/', postJournalController);
router.patch('/batch/post', postDraftJournalsBatchController);
router.patch('/batch/void', voidDraftJournalsBatchController);
router.put('/:journalId', updateDraftJournalController);
router.patch('/:journalId/post', postDraftJournalController);
router.patch('/:journalId/void', voidDraftJournalController);
router.patch('/:journalId/reverse', reverseJournalController);
router.post('/:journalId/copy', copyJournalController);
router.get('/period-status', getPeriodStatusController);
router.get('/:journalId', getJournalController);

export default router;
