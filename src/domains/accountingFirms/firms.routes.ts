import express from "express";
import { checkSlugController, getAllSlugs } from "./firms.controller";

const router = express.Router({ mergeParams: true });

router.get("/check-slug", checkSlugController);
router.get("/slugs", getAllSlugs);

export default router;
