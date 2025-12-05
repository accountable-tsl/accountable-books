import express from 'express';

import {
  deleteObjectController,
  uploadObjectController,
} from './objects.controller.js';
import { createMulter } from './objects.utils.js';

const router = express.Router({ mergeParams: true });
const upload = createMulter();

router.post(
  '/:objectType/upload',
  upload.single('file'),
  uploadObjectController,
);

router.delete('/:objectType/delete', deleteObjectController);

export default router;
