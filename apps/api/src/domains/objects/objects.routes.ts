import express from 'express';

import {
  deleteObjectController,
  getObjDownloadUrl,
  getObjUploadUrl,
  getTxnFilesController,
  uploadObjectController,
  uploadTxnFilesController,
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

router.post('/:companyId/objects/txn-files', uploadTxnFilesController);

router.post('/:companyId/objects/get-txn-files', getTxnFilesController);

export default router;
