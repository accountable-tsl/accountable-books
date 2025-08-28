import express from 'express';
// Load env solely via config/env to avoid duplicate dotenv loads
import cors from 'cors';
import currencyRoutes from './domains/currencies/currencies.routes.js';
import countryRoutes from './domains/countries/countries.routes.js';
import emailRoutes from './domains/email/email.routes.js';
import onboardingRoutes from './features/onboarding/onboarding.routes.js';
import signupRoutes from './features/signup/signup.routes.js';
import usersRoutes from './domains/users/users.routes.js';
import authRoutes from './features/auth/auth.routes.js';
import companiesRoutes from './domains/companies/companies.routes.js';
import objectRoutes from './domains/objects/objects.routes.js';
import firmRoutes from './domains/accountingFirms/firms.routes.js';
import bankRoutes from './domains/banks/banks.routes.js';
import bankAccountsRoutes from './domains/bankAccounts/bankAccounts.routes.js';
import bankTransactionRoutes from './domains/bankTransactions/bankTransactions.routes.js';
import bankFeedProvidersRoutes from './domains/bankFeedProviders/bankFeedProviders.routes.js';
import bankAccountConnectionsRoutes from './domains/bankAccountConnections/baccons.routes.js';
import usersCompaniesRolesRoutes from './domains/userRoles/userRoles.routes.js';
import coaRoutes from './domains/chartOfAccounts/coa.routes.js';
import accountRoutes from './domains/account/account.routes.js';
import contactsRoutes from './domains/contacts/contacts.routes.js';
import projectsRoutes from './domains/projects/projects.routes.js';
import { swaggerUi, specs } from './docs/swagger.js';
import { serverAdapter } from './lib/bullboard.js';
import { basicAuth } from './core/middlewares/basicAuth.middleware.js';
import { ENV, isDev } from './config/env.js';
import { loadRoles } from './domains/roles/roles.model.js';
import cookieParser from 'cookie-parser';
import { conditionalCsrf, verifyRefreshToken } from './features/auth/auth.middleware.js';
import { loadAccountMeta } from './domains/account/account.registry.js';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import path from 'path';

export const FRONTEND_URL = ENV.FRONTEND_URL!;

export const app = express();
const logger = isDev
  ? pino({ transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } })
  : pino();

app.use(express.json());
app.use(cookieParser());

app.use(pinoHttp({ logger }));

app.get('/health', (_req: express.Request, res: express.Response) =>
  res.status(200).json({ ok: true }),
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

const devOrigins = [
  'http://app.lvh.me:5173',
  'http://app.lvh.me:5174',
  'http://app.lvh.me:3001',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3001',
  /^https?:\/\/[\w-]+\.lvh\.me:(5173|5174|3001)$/,
];

const allowedOrigins =
  process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL]
    : [process.env.FRONTEND_URL, ...devOrigins];
export async function setupApp() {
  // Load critical stuff first
  await loadRoles();
  await loadAccountMeta();

  app.use(cors({ origin: allowedOrigins, credentials: true }));
  // Serve built static assets first (Docker runtime) then fallback to dev path
  app.use(express.static('./dist/public'));
  app.use(express.static('./public'));

  app.use(conditionalCsrf);

  const bullboardUser = process.env.BULLBOARD_USER || 'admin';
  const bullboardPass = process.env.BULLBOARD_PASSWORD || 'secret';

  // Mount routes AFTER successful load
  app.use('/api', signupRoutes);
  app.use('/auth', authRoutes);
  app.use('/api/currencies', currencyRoutes);
  app.use('/api/countries', countryRoutes);
  app.use('/api/email', emailRoutes);
  app.use('/api/accounting-firms/check-slug', firmRoutes);
  app.use('/api/accounts/classification/metadata', accountRoutes);

  app.use('/api', verifyRefreshToken);

  app.use('/api/onboarding', onboardingRoutes);
  app.use('/api/companies', companiesRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api', objectRoutes);
  app.use('/api/accounting-firms', firmRoutes);

  app.use('/api/banks', bankRoutes);
  app.use('/api/:companyId/bank-accounts', bankAccountsRoutes);
  app.use('/api/:companyId/bank-accounts/transactions', bankTransactionRoutes);
  app.use('/api/bank-feed-providers', bankFeedProvidersRoutes);
  app.use('/api/:companyId/bank-connections', bankAccountConnectionsRoutes);
  app.use('/api/:companyId', usersCompaniesRolesRoutes);

  app.use('/api/:companyId/coa', coaRoutes);
  app.use('/api/:companyId/contacts', contactsRoutes);
  app.use('/api/:companyId/projects', projectsRoutes);

  app.use('/admin/queues', basicAuth(bullboardUser, bullboardPass));
  app.use('/admin/queues', serverAdapter.getRouter());

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
}
