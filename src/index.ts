import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import express, { NextFunction, Request, Response } from "express";
import "dotenv/config";
import cors from "cors";
// import usersRoute from "./controllers/usersController";
// import companiesRoutes from "./routes/companiesRoutes";
// import coaRoutes from "./routes/coaRoutes";
// import bankRoutes from "./routes/bankRoutes";
// import bankAccountRoutes from "./routes/bankAccountRoutes";
// import currenciesRoutes from "./routes/currenciesRoutes";
// import bankTransactionRoutes from "./routes/bankTransactionRoutes";
// import exRateRoutes from "./routes/exRateRoutes";
// import transactionRoutes from "./routes/transactionRoutes";
// import accountTransactionRoutes from "./routes/accountTransactionRoutes";
// import journalRoutes from "./routes/journalRoutes";
// import reportingRoutes from "./routes/reportingRoutes";
import currencyRoutes from "./domains/currency/currency.routes";
import countryRoutes from "./domains/country/country.routes";
import emailRoutes from "./domains/email/email.routes";
import signupRoutes from "./features/signup/signup.routes";
import authRoutes from "./features/auth/auth.routes";
import companiesRoutes from "./domains/companies/companies.routes";
import { swaggerUi, specs } from "../swagger";
import { serverAdapter } from "./routes/bullboard.routes";
import { basicAuth } from "./core/middlewares/basicAuth.middleware";
import { ENV, NODE_ENV } from "./config/env";

const PORT = ENV.PORT || 8080;
const BACKEND_URL = ENV.BACKEND_URL || "http://localhost";
const FRONTEND_URL = ENV.FRONTEND_URL || "http://localhost:5173";

const app = express();
app.use(express.json());

const allowedOrigins = [FRONTEND_URL];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.static("./public"));

const bullboardUser = process.env.BULLBOARD_USER || "admin";
const bullboardPass = process.env.BULLBOARD_PASSWORD || "secret";

// app.use("/api/:companyId/coa", coaRoutes);
// app.use("/api/companies/", companiesRoutes);
// app.use("/api", exRateRoutes);
// app.use("/api/banks", bankRoutes);
// app.use("/api/:companyId/bank-accounts/transactions", bankTransactionRoutes);
// app.use("/api/:companyId/bank-accounts", bankAccountRoutes);
// app.use("/api/:companyId/transactions", transactionRoutes);
// app.use("/api/:companyId/account-transactions", accountTransactionRoutes);
// app.use("/api/:companyId/journals", journalRoutes);
// app.use("/api/:companyId/reports", reportingRoutes);
app.use("/api", signupRoutes);
app.use("/auth", authRoutes);
app.use("/api/currencies", currencyRoutes);
app.use("/api/countries", countryRoutes);
app.use("/api/email", emailRoutes);

app.use("api/companies", companiesRoutes);

app.use("/admin/queues", basicAuth(bullboardUser, bullboardPass));
app.use("/admin/queues", serverAdapter.getRouter());
// app.use("api/users", userRoutes);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

Sentry.setupExpressErrorHandler(app);

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`Server is running in ${NODE_ENV} on ${BACKEND_URL}:${PORT}`);
  console.log(`Bull Board available at ${BACKEND_URL}:${PORT}/admin/queues`);
});
