// import type { Request, Response } from 'express';
// import {
//   enqueueGLBalance,
//   enqueueBankBalance,
// } from '../../jobs/queues/balance-recalc.queue.js';
// import { knexClient as db } from '../../db/knexClient.js';
// import {
//   successResponse,
//   errorResponse,
// } from '../../shared/utils/response.utils.js';
// import type { AuthRequest } from '../../features/auth/auth.types.js';

// /**
//  * Balance management controller
//  * Handles manual balance recalculation and balance queries
//  */
// export class BalancesController {
//   /**
//    * Manually trigger GL balance recalculation for a specific COA
//    */
//   async recalculateGLBalance(req: AuthRequest, res: Response) {
//     try {
//       const companyId = req.company?.id;
//       const { coaId } = req.params;
//       const { recalcFrom } = req.body;

//       // Validate COA exists and belongs to company
//       const coa = await db('coa')
//         .where('id', coaId)
//         .where('company_id', companyId)
//         .first();

//       if (!coa) {
//         return res.status(404).json(errorResponse('COA not found'));
//       }

//       // Enqueue balance recalculation
//       const job = await enqueueGLBalance({
//         companyId: companyId || '',
//         coaId,
//         recalcFrom: recalcFrom || '2020-01-01', // Default to early date if not specified
//         triggeredBy: 'manual',
//       });

//       return res.json(
//         successResponse('GL balance recalculation queued', {
//           jobId: job.id,
//           coaId,
//           recalcFrom: recalcFrom || '2020-01-01',
//         }),
//       );
//     } catch (error) {
//       return res.status(500).json(
//         errorResponse('Failed to queue GL balance recalculation', {
//           error: error instanceof Error ? error.message : 'Unknown error',
//         }),
//       );
//     }
//   }

//   /**
//    * Manually trigger bank balance recalculation for a specific bank account
//    */
//   async recalculateBankBalance(req: AuthRequest, res: Response) {
//     try {
//       const { id: companyId } = req.company!;
//       const { bankAccountId } = req.params;
//       const { recalcFrom } = req.body;

//       // Validate bank account exists and belongs to company
//       const bankAccount = await db('bank_accounts')
//         .where('id', bankAccountId)
//         .where('company_id', companyId)
//         .first();

//       if (!bankAccount) {
//         return res.status(404).json(errorResponse('Bank account not found'));
//       }

//       // Enqueue balance recalculation
//       const job = await enqueueBankBalance({
//         companyId,
//         bankAccountId,
//         recalcFrom: recalcFrom || '2020-01-01', // Default to early date if not specified
//         triggeredBy: 'manual',
//       });

//       return res.json(
//         successResponse('Bank balance recalculation queued', {
//           jobId: job.id,
//           bankAccountId,
//           recalcFrom: recalcFrom || '2020-01-01',
//         }),
//       );
//     } catch (error) {
//       return res.status(500).json(
//         errorResponse('Failed to queue bank balance recalculation', {
//           error: error instanceof Error ? error.message : 'Unknown error',
//         }),
//       );
//     }
//   }

//   /**
//    * Trigger recalculation for all GL accounts in the company
//    */
//   async recalculateAllGLBalances(req: Request, res: Response) {
//     try {
//       const { companyId } = req.company!;
//       const { recalcFrom } = req.body;

//       // Get all COA accounts for the company
//       const coaAccounts = await db('coa')
//         .where('company_id', companyId)
//         .select('id');

//       if (coaAccounts.length === 0) {
//         return res.json(
//           successResponse('No COA accounts found to recalculate'),
//         );
//       }

//       // Enqueue recalculation for each COA
//       const jobs = [];
//       for (const coa of coaAccounts) {
//         const job = await enqueueGLBalance({
//           companyId,
//           coaId: coa.id,
//           recalcFrom: recalcFrom || '2020-01-01',
//           triggeredBy: 'manual',
//         });
//         jobs.push({ coaId: coa.id, jobId: job.id });
//       }

//       return res.json(
//         successResponse('GL balance recalculation queued for all accounts', {
//           jobsQueued: jobs.length,
//           jobs: jobs.slice(0, 10), // Return first 10 jobs to avoid large response
//           recalcFrom: recalcFrom || '2020-01-01',
//         }),
//       );
//     } catch (error) {
//       return res
//         .status(500)
//         .json(
//           errorResponse(
//             'Failed to queue GL balance recalculation for all accounts',
//             { error: error instanceof Error ? error.message : 'Unknown error' },
//           ),
//         );
//     }
//   }

//   /**
//    * Trigger recalculation for all bank accounts in the company
//    */
//   async recalculateAllBankBalances(req: Request, res: Response) {
//     try {
//       const { companyId } = req.company!;
//       const { recalcFrom } = req.body;

//       // Get all bank accounts for the company
//       const bankAccounts = await db('bank_accounts')
//         .where('company_id', companyId)
//         .select('id');

//       if (bankAccounts.length === 0) {
//         return res.json(
//           successResponse('No bank accounts found to recalculate'),
//         );
//       }

//       // Enqueue recalculation for each bank account
//       const jobs = [];
//       for (const account of bankAccounts) {
//         const job = await enqueueBankBalance({
//           companyId,
//           bankAccountId: account.id,
//           recalcFrom: recalcFrom || '2020-01-01',
//           triggeredBy: 'manual',
//         });
//         jobs.push({ bankAccountId: account.id, jobId: job.id });
//       }

//       return res.json(
//         successResponse('Bank balance recalculation queued for all accounts', {
//           jobsQueued: jobs.length,
//           jobs: jobs.slice(0, 10), // Return first 10 jobs to avoid large response
//           recalcFrom: recalcFrom || '2020-01-01',
//         }),
//       );
//     } catch (error) {
//       return res
//         .status(500)
//         .json(
//           errorResponse(
//             'Failed to queue bank balance recalculation for all accounts',
//             { error: error instanceof Error ? error.message : 'Unknown error' },
//           ),
//         );
//     }
//   }

//   /**
//    * Get current GL balance for a COA account
//    */
//   async getCurrentGLBalance(req: Request, res: Response) {
//     try {
//       const { companyId } = req.company!;
//       const { coaId } = req.params;

//       const balance = await db('gl_current_balances')
//         .where('company_id', companyId)
//         .where('coa_id', coaId)
//         .first();

//       if (!balance) {
//         return res.status(404).json(errorResponse('GL balance not found'));
//       }

//       return res.json(
//         successResponse('Current GL balance retrieved', {
//           coaId,
//           balance: balance.reporting_currency_balance,
//           asOfTime: balance.as_of_time,
//         }),
//       );
//     } catch (error) {
//       return res.status(500).json(
//         errorResponse('Failed to retrieve GL balance', {
//           error: error instanceof Error ? error.message : 'Unknown error',
//         }),
//       );
//     }
//   }

//   /**
//    * Get current bank balance for a bank account
//    */
//   async getCurrentBankBalance(req: Request, res: Response) {
//     try {
//       const { companyId } = req.company!;
//       const { bankAccountId } = req.params;

//       const balance = await db('bank_account_current_native_balances')
//         .where('company_id', companyId)
//         .where('bank_account_id', bankAccountId)
//         .first();

//       if (!balance) {
//         return res.status(404).json(errorResponse('Bank balance not found'));
//       }

//       return res.json(
//         successResponse('Current bank balance retrieved', {
//           bankAccountId,
//           balance: balance.native_balance,
//           asOfTime: balance.as_of_time,
//         }),
//       );
//     } catch (error) {
//       return res.status(500).json(
//         errorResponse('Failed to retrieve bank balance', {
//           error: error instanceof Error ? error.message : 'Unknown error',
//         }),
//       );
//     }
//   }

//   /**
//    * Get GL balance history for a COA account
//    */
//   async getGLBalanceHistory(req: Request, res: Response) {
//     try {
//       const { companyId } = req.company!;
//       const { coaId } = req.params;
//       const { fromDate, toDate, limit = 30 } = req.query;

//       let query = db('gl_daily_balance_snapshots')
//         .where('company_id', companyId)
//         .where('coa_id', coaId)
//         .orderBy('day', 'desc')
//         .limit(Number(limit));

//       if (fromDate) {
//         query = query.where('day', '>=', String(fromDate));
//       }
//       if (toDate) {
//         query = query.where('day', '<=', String(toDate));
//       }

//       const history = await query;

//       return res.json(
//         successResponse('GL balance history retrieved', {
//           coaId,
//           history: history.map((h) => ({
//             day: h.day,
//             balance: h.reporting_currency_balance,
//           })),
//           count: history.length,
//         }),
//       );
//     } catch (error) {
//       return res.status(500).json(
//         errorResponse('Failed to retrieve GL balance history', {
//           error: error instanceof Error ? error.message : 'Unknown error',
//         }),
//       );
//     }
//   }

//   /**
//    * Get bank balance history for a bank account
//    */
//   async getBankBalanceHistory(req: Request, res: Response) {
//     try {
//       const { companyId } = req.company!;
//       const { bankAccountId } = req.params;
//       const { fromDate, toDate, limit = 30 } = req.query;

//       let query = db('bank_account_daily_native_snapshots')
//         .where('company_id', companyId)
//         .where('bank_account_id', bankAccountId)
//         .orderBy('day', 'desc')
//         .limit(Number(limit));

//       if (fromDate) {
//         query = query.where('day', '>=', String(fromDate));
//       }
//       if (toDate) {
//         query = query.where('day', '<=', String(toDate));
//       }

//       const history = await query;

//       return res.json(
//         successResponse('Bank balance history retrieved', {
//           bankAccountId,
//           history: history.map((h) => ({
//             day: h.day,
//             balance: h.native_balance,
//           })),
//           count: history.length,
//         }),
//       );
//     } catch (error) {
//       return res.status(500).json(
//         errorResponse('Failed to retrieve bank balance history', {
//           error: error instanceof Error ? error.message : 'Unknown error',
//         }),
//       );
//     }
//   }
// }

// // Export singleton instance
// export const balancesController = new BalancesController();
