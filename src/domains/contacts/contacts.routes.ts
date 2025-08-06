import express from "express";
import {
  addContactsController,
  getContactsController,
  updateContactsController,
} from "./contacts.controller";

const router = express.Router({ mergeParams: true });

router.post("/query", getContactsController);
router.post("/", addContactsController);
router.patch("/", updateContactsController);

export default router;
