import express from "express";
import { checkCompanyId } from "../middlewares/companyMiddleware";
import {
  createJournals,
  bulkCreateJournals,
  createRecurringJournals,
  getJournals,
  getSingleJournal,
  reverseJournal,
  softDeleteJournals,
  updateJournal,
} from "../controllers/journalControllers";

const router = express.Router({ mergeParams: true });

router.get("/", checkCompanyId, getJournals);
router.get("/:journalId", checkCompanyId, getSingleJournal);

router.post("/", checkCompanyId, createJournals);
router.put("/:journalId", checkCompanyId, updateJournal);

router.post("/bulk", checkCompanyId, bulkCreateJournals);
router.post("/recurring", checkCompanyId, createRecurringJournals);
router.post("/:journalId/reverse", checkCompanyId, reverseJournal);
router.patch("/:journalId", checkCompanyId, softDeleteJournals);

export default router;
