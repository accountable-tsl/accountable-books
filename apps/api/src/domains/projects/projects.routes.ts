import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import {
  addNewProjectsController,
  deleteProjectController,
  getProjectsController,
  updateProjectsController,
} from './projects.controller.js';

const router = express.Router({ mergeParams: true });

router.use(checkCompanyId);

router.post('/query', getProjectsController);
router.post('/', addNewProjectsController);
router.patch('/', updateProjectsController);
router.delete('/:projectId', deleteProjectController);

export default router;
