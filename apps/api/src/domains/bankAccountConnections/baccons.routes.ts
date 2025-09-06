import express from 'express';
import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';

const router = express.Router({ mergeParams: true });

// router.post('/', checkCompanyId, addNewBankAccountConnection);

export default router;
