import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import express, { NextFunction, Request, Response } from "express";
import "dotenv/config";
import cors from "cors";
import currencyRoutes from "./domains/currency/currency.routes";
import countryRoutes from "./domains/country/countries.routes";
import emailRoutes from "./domains/email/email.routes";
import onboardingRoutes from "./features/onboarding/onboarding.routes";
import signupRoutes from "./features/signup/signup.routes";
import usersRoutes from "./domains/users/users.routes";
import authRoutes from "./features/auth/auth.routes";
import companiesRoutes from "./domains/companies/companies.routes";
import objectRoutes from "./domains/objects/objects.routes";
import firmRoutes from "./domains/accountingFirms/firms.routes";
import bankAccountsRoutes from "./domains/bankAccounts/bankAccounts.routes";
import { swaggerUi, specs } from "../swagger";
import { serverAdapter } from "./routes/bullboard.routes";
import { basicAuth } from "./core/middlewares/basicAuth.middleware";
import { ENV, NODE_ENV } from "./config/env";
import { loadRoles } from "./domains/roles/roles.model";
import cookieParser from "cookie-parser";
import {
  conditionalCsrf,
  verifyRefreshToken,
} from "./features/auth/auth.middleware";

const PORT = ENV.PORT!;
export const BACKEND_URL = ENV.BACKEND_URL!;
export const FRONTEND_URL = ENV.FRONTEND_URL!;

const app = express();
app.use(express.json());
app.use(cookieParser());

const originalError = console.error;
console.error = (...args: unknown[]) => {
  originalError(...args);

  for (const arg of args) {
    if (arg instanceof Error && arg.stack) {
      originalError("Stack Trace:", arg.stack);
      return;
    }
  }

  // fallback if no Error instance is found
  const fallbackStack = new Error().stack;
  if (fallbackStack) originalError("Generated Stack Trace:", fallbackStack);
};

const allowedOrigins = [
  FRONTEND_URL,
  /^https?:\/\/[\w-]+\.localhost(:\d+)?$/,
  "http://lvh.me:5173",
  /\.lvh\.me(:5173)?$/,
  new RegExp(
    `^https?:\/\/[\w-]+\.${FRONTEND_URL.replace(/^https?:\/\//, "").replace(/\./g, "\\.")}$`
  ),
];
async function startServer() {
  try {
    // Load critical stuff first
    await loadRoles();

    app.use(cors({ origin: allowedOrigins, credentials: true }));
    app.use(express.static("./public"));

    app.use(conditionalCsrf);

    const bullboardUser = process.env.BULLBOARD_USER || "admin";
    const bullboardPass = process.env.BULLBOARD_PASSWORD || "secret";

    // Mount routes AFTER successful load
    app.use("/api", signupRoutes);
    app.use("/auth", authRoutes);
    app.use("/api/currencies", currencyRoutes);
    app.use("/api/countries", countryRoutes);
    app.use("/api/email", emailRoutes);

    app.use("/api", verifyRefreshToken);

    app.use("/api/onboarding", onboardingRoutes);
    app.use("/api/companies", companiesRoutes);
    app.use("/api/users", usersRoutes);
    app.use("/api", objectRoutes);
    app.use("/api/accounting-firms", firmRoutes);

    app.use("/api/:companyId/bank-accounts", bankAccountsRoutes);

    app.use("/admin/queues", basicAuth(bullboardUser, bullboardPass));
    app.use("/admin/queues", serverAdapter.getRouter());

    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

    Sentry.setupExpressErrorHandler(app);
    const listeningOn = `api.${ENV.BASE_DOMAIN!}`; //
    app.listen(Number(PORT), listeningOn, () => {
      console.log(`Server is running in ${NODE_ENV} on ${BACKEND_URL}`);
      console.log(`Bull Board available at ${BACKEND_URL}/admin/queues`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
