import express from "express";
import { checkCompanyId } from "../../core/middlewares/companies.middleware";
import { getBankFeedProvidersController } from "./bankFeedProviders.controller";

const router = express.Router({ mergeParams: true });

router.get("/", getBankFeedProvidersController);

export default router;
