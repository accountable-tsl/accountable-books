import express from "express";
import "dotenv/config.js";
import cors from "cors";
import usersRoute from "./controllers/usersController";
import companiesRoute from "./controllers/companiesController";

const PORT = process.env.PORT;
const BACKEND_URL = process.env.BACKEND_URL;
const FRONTEND_URL = process.env.FRONTEND_URL;

const app = express();
app.use(express.json());
app.use(cors());

// app.use("api/users", userRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on ${BACKEND_URL}:${PORT}`);
});
