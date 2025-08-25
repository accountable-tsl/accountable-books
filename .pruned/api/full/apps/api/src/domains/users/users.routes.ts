import express from 'express';
import { getUserDetailsController } from './users.controller.js';

const router = express.Router({ mergeParams: true });

router.get('/:id', getUserDetailsController);

export default router;
