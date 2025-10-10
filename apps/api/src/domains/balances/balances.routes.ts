// import express from 'express';
// import { balancesController } from './balances.controller.js';
// import { requireAuth } from '../../middleware/auth.middleware.js';
// import { requireCompanyAccess } from '../../middleware/company.middleware.js';

// const router = express.Router();

// /**
//  * Balance management routes
//  * All routes require authentication and company access
//  */

// // Manual balance recalculation endpoints (admin/support use)
// router.post(
//   '/recalc/gl/:coaId',
//   requireAuth,
//   requireCompanyAccess,
//   balancesController.recalculateGLBalance.bind(balancesController),
// );

// router.post(
//   '/recalc/bank/:bankAccountId',
//   requireAuth,
//   requireCompanyAccess,
//   balancesController.recalculateBankBalance.bind(balancesController),
// );

// // Bulk recalculation endpoints
// router.post(
//   '/recalc/all-gl',
//   requireAuth,
//   requireCompanyAccess,
//   balancesController.recalculateAllGLBalances.bind(balancesController),
// );

// router.post(
//   '/recalc/all-bank',
//   requireAuth,
//   requireCompanyAccess,
//   balancesController.recalculateAllBankBalances.bind(balancesController),
// );

// // Balance query endpoints
// router.get(
//   '/gl/:coaId/current',
//   requireAuth,
//   requireCompanyAccess,
//   balancesController.getCurrentGLBalance.bind(balancesController),
// );

// router.get(
//   '/bank/:bankAccountId/current',
//   requireAuth,
//   requireCompanyAccess,
//   balancesController.getCurrentBankBalance.bind(balancesController),
// );

// router.get(
//   '/gl/:coaId/history',
//   requireAuth,
//   requireCompanyAccess,
//   balancesController.getGLBalanceHistory.bind(balancesController),
// );

// router.get(
//   '/bank/:bankAccountId/history',
//   requireAuth,
//   requireCompanyAccess,
//   balancesController.getBankBalanceHistory.bind(balancesController),
// );

// export { router as balancesRoutes };
