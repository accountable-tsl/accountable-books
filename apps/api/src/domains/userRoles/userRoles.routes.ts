import express from "express";
import { grantAccessToCompanyController } from "./userRoles.controller";
import { checkCompanyId } from "../../core/middlewares/companies.middleware";
const router = express.Router({ mergeParams: true });

router.post("/grant-access", checkCompanyId, grantAccessToCompanyController);
export default router;
