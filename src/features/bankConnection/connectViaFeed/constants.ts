// import crypto from "crypto";
import {
  bankAccountType,
  BankAccountWithMeta,
} from "@/domains/bankAccounts/types";

const generateId = () =>
  typeof window !== "undefined" && window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : Math.random().toString(36).substring(2, 10); // fallback

