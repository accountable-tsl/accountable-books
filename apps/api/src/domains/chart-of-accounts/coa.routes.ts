import express from 'express';

import {
  archiveCoaController,
  createCoaController,
  deleteCoaController,
  editCoaController,
  getCoaController,
  unarchiveCoaController,
} from './coa.controller.js';

const router = express.Router({ mergeParams: true });

router.get('/', getCoaController);

router.post('/', createCoaController);

router.patch('/edit', editCoaController);
router.patch('/archive', archiveCoaController);
router.patch('/unarchive', unarchiveCoaController);

router.delete('/', deleteCoaController);

export default router;
