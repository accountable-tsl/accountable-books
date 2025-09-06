import { Router } from 'express';
import { BankingController, createCredential } from './banking.controller.js';

const router = Router({ mergeParams: true });
const bankingController = new BankingController();

// POST /api/banking/link-token
router.post('/link-token', bankingController.createLinkToken.bind(bankingController));

// POST /api/banking/connect-accounts
router.post('/connect-accounts', bankingController.connectBankAccounts.bind(bankingController));

// NEW: PUT /api/banking/accounts/:accountId/classify
router.put(
  '/accounts/:accountId/classify',
  bankingController.classifyBankAccount.bind(bankingController),
);

// GET /api/banking/supported-countries
router.get('/supported-countries', bankingController.getSupportedCountries.bind(bankingController));

// GET /api/banking/test-connection/:provider
router.get('/test-connection/:provider', bankingController.testConnection.bind(bankingController));

router.post('/company-credentials', createCredential);

export default router;
