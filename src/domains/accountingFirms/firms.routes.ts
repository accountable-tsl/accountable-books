import express from "express";
import { checkSlugController } from "./firms.controller";

const router = express.Router({ mergeParams: true });

router.get("/check-slug", checkSlugController);

export default router;
