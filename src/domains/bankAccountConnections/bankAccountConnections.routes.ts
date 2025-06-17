import express from "express";
import { checkCompanyId } from "../../core/middlewares/companies.middleware";
import { addNewBankAccountConnection } from "./bankAccountConnections.controller";

const router = express.Router({ mergeParams: true });

router.post("/", checkCompanyId, addNewBankAccountConnection);

export default router;
