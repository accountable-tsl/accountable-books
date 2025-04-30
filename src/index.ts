import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import express, { NextFunction, Request, Response } from "express";
import "dotenv/config";
import cors from "cors";
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
import { loadRoles } from "./domains/roles/roles.model";
import cookieParser from "cookie-parser";
import {
  conditionalCsrf,
  verifyRefreshToken,
} from "./features/auth/auth.middleware";
import { subdomain } from "./core/middlewares/subdomain.middleware";

const PORT = ENV.PORT!;
export const BACKEND_URL = ENV.BACKEND_URL!;
export const FRONTEND_URL = ENV.FRONTEND_URL!;

const app = express();
app.use(express.json());
app.use(cookieParser());

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

    app.use(verifyRefreshToken);

    app.use("/api/currencies", currencyRoutes);
    app.use("/api/countries", countryRoutes);
    app.use("/api/email", emailRoutes);
    app.use("/api/companies", companiesRoutes);

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
