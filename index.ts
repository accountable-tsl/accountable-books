import express from "express";
import "dotenv/config";
import cors from "cors";
import usersRoute from "./controllers/usersController";
import companiesRoutes from "./routes/companiesRoutes";
import coaRoutes from "./routes/coaRoutes";
import bankRoutes from "./routes/bankRoutes";
import bankAccountRoutes from "./routes/bankAccountRoutes";
import currenciesRoutes from "./routes/currenciesRoutes";
import bankTransactionRoutes from "./routes/bankTransactionRoutes";
import exRateRoutes from "./routes/exRateRoutes";
import transactionRoutes from "./routes/transactionRoutes";
import accountTransactionRoutes from "./routes/accountTransactionRoutes";
import journalRoutes from "./routes/journalRoutes";
import reportingRoutes from "./routes/reportingRoutes";
import { swaggerUi, specs } from "./swagger";

const NODE_ENV = process.env.NODE_ENV || "development";

const PORT = process.env.PORT || 8080;
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const app = express();

app.use(express.json());

// app.use(cors({ origin: FRONTEND_URL }));
app.use(cors({ origin: "*" }));

app.use(express.static("./public"));

app.use("/api/:companyId/coa", coaRoutes);
app.use("/api/companies/", companiesRoutes);
app.use("/api/currencies", currenciesRoutes);
app.use("/api", exRateRoutes);
app.use("/api/banks", bankRoutes);
app.use("/api/:companyId/bank-accounts/transactions", bankTransactionRoutes);
app.use("/api/:companyId/bank-accounts", bankAccountRoutes);
app.use("/api/:companyId/transactions", transactionRoutes);
app.use("/api/:companyId/account-transactions", accountTransactionRoutes);
app.use("/api/:companyId/journals", journalRoutes);
app.use("/api/:companyId/reports", reportingRoutes);
// app.use("api/users", userRoutes);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`Server is running in ${NODE_ENV} on ${BACKEND_URL}:${PORT}`);
});
