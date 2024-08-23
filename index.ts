import express from "express";
import "dotenv/config";
import cors from "cors";
import usersRoute from "./controllers/usersController";
import companiesRoutes from "./routes/companiesRoutes";
import coaRoutes from "./routes/coaRoutes";

const PORT = process.env.PORT;
const BACKEND_URL = process.env.BACKEND_URL;
const FRONTEND_URL = process.env.FRONTEND_URL;

const app = express();

app.use(express.json());

app.use(express.static("./public"));

app.use(cors({ origin: FRONTEND_URL }));

app.use("/api/company", companiesRoutes);
app.use("/api/coa", coaRoutes);

// app.use("api/users", userRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on ${BACKEND_URL}:${PORT}`);
});
