// import crypto from "crypto";
import {
  bankAccountType,
  BankAccountWithMeta,
} from "@/domains/bankAccounts/types";
import { ConnectionResponse } from "./types";

const generateId = () =>
  typeof window !== "undefined" && window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : Math.random().toString(36).substring(2, 10); // fallback

export const sampleConnections: ConnectionResponse[] = [
  // Connected (existing account)
  {
    userActionRequired: false,
    connectionStatus: "connected",
    message: "Account auto-connected to existing account.",
    connectionDetails: {
      connectionId: "c1",
      providerId: "p1",
      providerName: "Mono",
      providerKey: "mono",
      providerBankAccountId: "mono_acc_111",
      bankAccountId: "ba_001",
    },
    accountDetails: {
      bankAccountId: "ba_001",
      bankName: "GTBank",
      accountName: "Main GTBank",
      accountNumber: "0234567891",
    },
    suggestedBankAccountMatches: [],
  },

  // New account created
  {
    userActionRequired: false,
    connectionStatus: "new_account_created",
    message: "A new bank account was created and connected.",
    connectionDetails: {
      connectionId: "c2",
      providerId: "p2",
      providerName: "Plaid",
      providerKey: "plaid",
      providerBankAccountId: "plaid_acc_222",
      bankAccountId: "ba_002",
    },
    accountDetails: {
      bankAccountId: "ba_002",
      bankName: "Zenith Bank",
      accountName: "Zenith Corporate",
      accountNumber: "0987654321",
    },
    suggestedBankAccountMatches: [],
  },

  // Needs user confirmation
  {
    userActionRequired: true,
    connectionStatus: "needs_user_confirmation",
    message: "Please confirm which account this connection belongs to.",
    connectionDetails: {
      connectionId: "c3",
      providerId: "p1",
      providerName: "Mono",
      providerKey: "mono",
      providerBankAccountId: "mono_acc_333",
      bankAccountId: "",
    },
    accountDetails: {
      bankAccountId: "",
      bankName: "GTBank",
      accountName: "Unmatched GTBank",
      accountNumber: "1231231231",
    },
    suggestedBankAccountMatches: [
      {
        bankAccountId: "ba_003",
        accountName: "Personal GTBank",
        accountNumber: "0234567891",
        bankId: "b1",
        bankName: "GTBank",
        currencyId: "ngn",
        currencyCode: "NGN",
        currencyName: "Nigerian Naira",
        currencySymbol: "₦",
        matchedFields: ["accountNumber", "bankName"],
      },
      {
        bankAccountId: "ba_004",
        accountName: "Zenith Current",
        accountNumber: "1098765432",
        bankId: "b2",
        bankName: "Zenith Bank",
        currencyId: "ngn",
        currencyCode: "NGN",
        currencyName: "Nigerian Naira",
        currencySymbol: "₦",
        matchedFields: ["currencyCode"],
      },
    ],
  },
  {
    userActionRequired: true,
    connectionStatus: "needs_user_confirmation",
    message: "Please confirm which account this connection belongs to.",
    connectionDetails: {
      connectionId: "c4",
      providerId: "p1",
      providerName: "Mono",
      providerKey: "mono",
      providerBankAccountId: "mono_acc_333",
      bankAccountId: "",
    },
    accountDetails: {
      bankAccountId: "",
      bankName: "FBN",
      accountName: "Unmatched FBN",
      accountNumber: "1231231041",
    },
    suggestedBankAccountMatches: [
      {
        bankAccountId: "ba_003",
        accountName: "Personal GTBank",
        accountNumber: "0234567891",
        bankId: "b1",
        bankName: "GTBank",
        currencyId: "ngn",
        currencyCode: "NGN",
        currencyName: "Nigerian Naira",
        currencySymbol: "₦",
        matchedFields: ["accountNumber", "bankName"],
      },
      {
        bankAccountId: "ba_004",
        accountName: "Zenith Current",
        accountNumber: "1098765432",
        bankId: "b2",
        bankName: "Zenith Bank",
        currencyId: "ngn",
        currencyCode: "NGN",
        currencyName: "Nigerian Naira",
        currencySymbol: "₦",
        matchedFields: ["currencyCode"],
      },
    ],
  },

  // Error case
  {
    userActionRequired: false,
    connectionStatus: "error",
    message:
      "An error occurred while connecting this account. Please try again.",
    connectionDetails: {
      connectionId: "c4",
      providerId: "p2",
      providerName: "Plaid",
      providerKey: "plaid",
      providerBankAccountId: "plaid_acc_444",
      bankAccountId: "",
    },
    accountDetails: {
      bankAccountId: "",
      bankName: "FCMCB",
      accountName: "This name",
      accountNumber: "1243454",
    },
    suggestedBankAccountMatches: [],
  },
];
