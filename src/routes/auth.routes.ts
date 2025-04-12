import express from "express";
import { signup } from "../controllers/auth.controller";

const router = express.Router({ mergeParams: true });

router.post("/signup", signup);

export default router;
