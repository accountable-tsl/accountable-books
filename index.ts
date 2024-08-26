import express from "express";
import "dotenv/config";
import cors from "cors";
import usersRoute from "./controllers/usersController";
import companiesRoutes from "./routes/companiesRoutes";
import coaRoutes from "./routes/coaRoutes";
import bankRoutes from "./routes/bankRoutes";
import bankAccountRoutes from "./routes/bankAccountRoutes";
import { swaggerUi, specs } from "./swagger";

const PORT = process.env.PORT;
const BACKEND_URL = process.env.BACKEND_URL;
const FRONTEND_URL = process.env.FRONTEND_URL;

const app = express();

app.use(express.json());

app.use(cors({ origin: FRONTEND_URL }));

app.use("/api/:companyId/coa", coaRoutes);
app.use("/api/:companyId/company", companiesRoutes);
app.use("/api/banks", bankRoutes);
app.use("/api/:companyId/banks/accounts", bankAccountRoutes);
// app.use("api/users", userRoutes);

app.use(express.static("./public"));

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

app.listen(PORT, () => {
  console.log(`Server is running on ${BACKEND_URL}:${PORT}`);
});
