import express from 'express';

import {
  deleteObjectController,
  getObjDownloadUrl,
  getObjUploadUrl,
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

router.post('/:companyId/objects/url/upload', getObjUploadUrl);

router.get('/objects/url/download', getObjDownloadUrl);

export default router;
