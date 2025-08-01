import express from "express";
import {
  addContactsController,
  fetchContactsController,
  updateContactsController,
} from "./contacts.controller";

const router = express.Router({ mergeParams: true });

router.get("/", fetchContactsController);
router.post("/", addContactsController);
router.patch("/", updateContactsController);

export default router;
