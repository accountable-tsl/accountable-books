import express from "express";
import { grantAccessToCompanyController } from "./userRoles.controller.js";
import { checkCompanyId } from "../../core/middlewares/companies.middleware.js";
const router = express.Router({ mergeParams: true });

router.post("/grant-access", checkCompanyId, grantAccessToCompanyController);
export default router;
