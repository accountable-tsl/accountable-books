import { Router } from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import { BankingController } from './banking.controller.js';

const router = Router({ mergeParams: true });
const bankingController = new BankingController();

router.get(
  '/supported-countries',
  bankingController.getSupportedCountries.bind(bankingController),
);

router.use(checkCompanyId);

router.post(
  '/link-token',
  bankingController.createLinkToken.bind(bankingController),
);

router.post(
  '/connect-accounts',
  bankingController.connectBankAccounts.bind(bankingController),
);

router.post(
  '/feeds/:feedId/stop',
  bankingController.stopBankAccountFeed.bind(bankingController),
);

router.post(
  '/connections/:connectionId/revoke',
  bankingController.revokeBankConnection.bind(bankingController),
);

router.post(
  '/connections/:connectionId/reauthorization-completed',
  bankingController.completeConnectionReauthorization.bind(bankingController),
);

router.put(
  '/accounts/:accountId/classify',
  bankingController.classifyBankAccount.bind(bankingController),
);

router.get(
  '/test-connection/:provider',
  bankingController.testConnection.bind(bankingController),
);

router.post(
  '/sync-transactions',
  bankingController.syncTransactions.bind(bankingController),
);

export default router;
