import express from 'express';
import cookieParser from 'cookie-parser';
// Load env solely via config/env to avoid duplicate dotenv loads
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { ENV, isDev, NODE_ENV } from './config/env.js';
import { basicAuth } from './core/middlewares/basicAuth.middleware.js';
import { conditionalJsonParser } from './core/middlewares/bodyParser.middleware.js';
import { knexClient } from './db/knexClient.js';
import { specs, swaggerUi } from './docs/swagger.js';
import { loadAccountMeta } from './domains/account/account.registry.js';
import accountRoutes from './domains/account/account.routes.js';
import firmRoutes from './domains/accountingFirms/firms.routes.js';
import aiRoutes from './domains/ai/ai.routes.js';
import { attachAuditContext } from './domains/audit/audit.middleware.js';
import bankAccountsRoutes from './domains/banking/bankAccounts/bankAccounts.routes.js';
import bankFeedProvidersRoutes from './domains/banking/bankFeedProviders/bankFeedProviders.routes.js';
import bankingRoutes from './domains/banking/banking.routes.js';
import bankRoutes from './domains/banking/banks/banks.routes.js';
import plaidWebhookRoutes from './domains/banking/webhooks/plaid.webhook.js';
import bankTransactionRoutes from './domains/bankTransactions/bankTransactions.routes.js';
import billingRoutes from './domains/billing/billing.routes.js';
import categorizationRoutes from './domains/categorization/categorization.routes.js';
import coaRoutes from './domains/chart-of-accounts/coa.routes.js';
import companiesRoutes from './domains/companies/companies.routes.js';
import contactsRoutes from './domains/contacts/contacts.routes.js';
import countryRoutes from './domains/countries/countries.routes.js';
import currencyRoutes from './domains/currencies/currencies.routes.js';
import emailRoutes from './domains/email/email.routes.js';
import journalsRoutes from './domains/journals/journals.routes.js';
import ledgersRoutes from './domains/ledgers/ledgers.routes.js';
import objectRoutes from './domains/objects/objects.routes.js';
import projectsRoutes from './domains/projects/projects.routes.js';
import periodStatusRoutes from './domains/reporting/fiscal-calendar/period-status.routes.js';
import { loadRoles } from './domains/roles/roles.model.js';
import settingsRoutes from './domains/settings/settings.routes.js';
import supportAccessRoutes from './domains/support-access/support-access.routes.js';
import usersCompaniesRolesRoutes from './domains/user-roles/user-roles.routes.js';
import usersRoutes from './domains/users/users.routes.js';
import {
  conditionalCsrf,
  verifyAccessToken,
} from './features/auth/auth.middleware.js';
import authRoutes from './features/auth/auth.routes.js';
import onboardingRoutes from './features/onboarding/onboarding.routes.js';
import signupRoutes from './features/signup/signup.routes.js';
import { createHealthRouter } from './health.js';
import { redis } from './lib/redis.js';
import { requestContextMiddleware } from './shared/telemetry/request-context.js';
import { logger } from './shared/utils/logger.js';

export const FRONTEND_URL = ENV.FRONTEND_URL!;

export const app = express();

app.use(conditionalJsonParser());
app.use(cookieParser());
app.use(requestContextMiddleware);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.use(
  pinoHttp({
    logger,
    genReqId(req) {
      return (req as typeof req & { id?: string }).id;
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-csrf-token"]',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
  }),
);

app.use(attachAuditContext);

app.use(
  '/health',
  createHealthRouter({
    checkPostgres: () => knexClient.raw('SELECT 1'),
    checkRedis: () => redis.ping(),
  }),
);

// const originalError = console.error;
// console.error = (...args: unknown[]) => {
//   originalError(...args);

//   for (const arg of args) {
//     if (arg instanceof Error && arg.stack) {
//       originalError('Stack Trace:', arg.stack);
//       return;
//     }
//   }

//   // fallback if no Error instance is found
//   const fallbackStack = new Error().stack;
//   if (fallbackStack) originalError('Generated Stack Trace:', fallbackStack);
// };

const exact = new Set<string>([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://app.lvh.me:5173',
  'http://app.lvh.me:5174',
  'http://app.lvh.me:3000',
  'http://app.lvh.me:3001',
  'https://staging.getaccountable.com', // staging web
  'https://app.getaccountable.com', // production web
]);

const patterns: RegExp[] = [
  /^https:\/\/[\w-]+\.getaccountable\.com$/,
  ...(NODE_ENV === 'staging' ? [/^https:\/\/.+\.vercel\.app$/] : []),
  /^https?:\/\/[\w-]+\.lvh\.me:(5173|5174|3001)$/,
];

export async function setupApp() {
  // Load critical stuff first
  await loadRoles();
  await loadAccountMeta();

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        const ok = exact.has(origin) || patterns.some((rx) => rx.test(origin));
        cb(null, ok); // FIX: Must be (null, true/false) not (error)
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
      exposedHeaders: ['X-CSRF-Token'],
    }),
  );

  // Serve built static assets first (Docker runtime) then fallback to dev path
  app.use(express.static('./dist/public'));
  app.use(express.static('./public'));

  app.use(conditionalCsrf);

  if (!isDev && (!ENV.BULLBOARD_USER || !ENV.BULLBOARD_PASSWORD)) {
    throw new Error('BullBoard credentials not configured');
  }

  const bullboardUser = ENV.BULLBOARD_USER || 'admin';
  const bullboardPass = ENV.BULLBOARD_PASSWORD || 'secret';

  // Mount routes AFTER successful load
  app.use('/api', signupRoutes);
  app.use('/auth', authRoutes);
  app.use('/api/currencies', currencyRoutes);
  app.use('/api/countries', countryRoutes);
  app.use('/api/email', emailRoutes);
  app.use('/api/accounting-firms/check-slug', firmRoutes);
  app.use('/api/accounts/classification/metadata', accountRoutes);

  // Webhooks (no auth required)
  app.use('/', plaidWebhookRoutes);

  app.use('/api', verifyAccessToken);

  app.use('/api/billing', billingRoutes);
  app.use('/api/onboarding', onboardingRoutes);
  app.use('/api/companies', companiesRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api', objectRoutes);
  app.use('/api/accounting-firms', firmRoutes);

  app.use('/api/banking', bankingRoutes);
  app.use('/api/banks', bankRoutes);
  app.use('/api/:companyId/bank-accounts', bankAccountsRoutes);
  app.use('/api/:companyId/bank-accounts/transactions', bankTransactionRoutes);
  app.use('/api/bank-feed-providers', bankFeedProvidersRoutes);
  app.use('/api/:companyId', usersCompaniesRolesRoutes);
  app.use('/api/:companyId', periodStatusRoutes);

  app.use('/api/:companyId/ai', aiRoutes);
  app.use('/api/:companyId/categorization', categorizationRoutes);
  app.use('/api/:companyId/coa', coaRoutes);
  app.use('/api/:companyId/ledgers', ledgersRoutes);
  app.use('/api/:companyId/journals', journalsRoutes);
  app.use('/api/:companyId/contacts', contactsRoutes);
  app.use('/api/:companyId/projects', projectsRoutes);
  app.use('/api/:companyId/settings', settingsRoutes);
  app.use('/api/:companyId/support-access', supportAccessRoutes);

  if (NODE_ENV !== 'test') {
    const { serverAdapter } = await import('./lib/bullboard.js');
    app.use('/admin/queues', basicAuth(bullboardUser, bullboardPass));
    app.use('/admin/queues', serverAdapter.getRouter());
  }

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
}
