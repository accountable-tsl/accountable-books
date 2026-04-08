import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import { verifyAccessToken } from '../../features/auth/auth.middleware.js';
import {
  createUploadIntentController,
  deleteCompanyLogoController,
  finalizeUploadIntentController,
  getPrivateFileDownloadUrlController,
  getTxnFilesController,
  uploadTxnFilesController,
} from './objects.controller.js';
import {
  requireCompanyLogoMutationAccess,
  requireFinalizeUploadIntentAccess,
  requireUploadIntentAccess,
} from './objects.middleware.js';

const router = express.Router({ mergeParams: true });

router.post(
  '/:companyId/files/upload-intents',
  verifyAccessToken,
  checkCompanyId,
  requireUploadIntentAccess,
  createUploadIntentController,
);

router.post(
  '/:companyId/files/finalize',
  verifyAccessToken,
  checkCompanyId,
  requireFinalizeUploadIntentAccess,
  finalizeUploadIntentController,
);

router.get(
  '/:companyId/files/url/download',
  verifyAccessToken,
  checkCompanyId,
  getPrivateFileDownloadUrlController,
);

router.delete(
  '/:companyId/company-logo',
  verifyAccessToken,
  checkCompanyId,
  requireCompanyLogoMutationAccess,
  deleteCompanyLogoController,
);

router.post(
  '/:companyId/objects/txn-files',
  verifyAccessToken,
  checkCompanyId,
  uploadTxnFilesController,
);

router.post(
  '/:companyId/objects/get-txn-files',
  verifyAccessToken,
  checkCompanyId,
  getTxnFilesController,
);

export default router;
