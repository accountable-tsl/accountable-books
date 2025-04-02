import {
  Bank,
  BankAccount,
  CategorisationStatus,
  Coa,
  Contact,
  Currency,
  DebitCredit,
  LedgerTransaction,
  Project,
  User,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { BankTransaction } from "./bank";

export type LedgerEntry = {
  id: string;
  ledgerTransactionId: string;
  fsDate: Date;
  coaId: string;
  transactionSide: DebitCredit;
  sourceCurrencyId: string;
  sourceAmount: Decimal;
  absoluteSourceAmount: Decimal;
  systemExchangeRate: Decimal;
  customExchangeRate: Decimal;
  amount: Decimal;
  absoluteAmount: Decimal;
  categorisationStatus: CategorisationStatus;
  description?: string | null;
  projectId?: string | null;
  journalEntry?: any;
  updatedById?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  isDeleted: boolean;
};

export type LedgerEntryWithRelations = LedgerEntry & {
  coa?: Coa;
  sourceCurrency?: Currency;
  project?: Project;
  updatedBy?: User;
  ledgerTransaction?: LedgerTransaction;
};

export type ExtendedLedgerTransaction = LedgerTransaction & {
  contact?: Pick<Contact, "name">;
  bankTransaction?: BankTransaction & {
    bankAccount: BankAccount & {
      bank: Pick<Bank, "name" | "bankLogo">;
    };
  };
  ledgerEntries: LedgerEntryWithRelations[];
};
