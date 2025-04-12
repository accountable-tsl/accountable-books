import {
  BankAccount,
  BankTransactionBatch,
  CategorisationStatus,
  DebitCredit,
  LedgerTransaction,
  User,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import {
  BoolFilter,
  DateTimeFilter,
  DecimalFilter,
  EnumFilter,
  StringFilter,
} from "./generic";

export type BankTransaction = {
  id: string;
  date: Date;
  payee?: string;
  reference?: string;
  description?: string;
  additionalComments?: string;
  transactionSide?: DebitCredit;
  amount: Decimal;
  absoluteAmount: Decimal;
  systemExchangeRate: Decimal;
  categorisationStatus: CategorisationStatus;
  bankAccountId: string;
  bankTransactionBatchId?: string;
  ledgerTransactionId?: string;
  createdById: string;
  updatedById?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt?: Date;
};

export type BankTransactionWithRelations = BankTransaction & {
  bankAccount: BankAccount;
  bankTransactionBatch?: BankTransactionBatch;
  ledgerTransaction?: LedgerTransaction;
  createdBy: User;
  updatedBy?: User;
};

export type EnumDebitCreditFilter = EnumFilter<DebitCredit>;
export type EnumCategorisationStatusFilter = EnumFilter<CategorisationStatus>;

// Where input for BankTransaction
export type BankTransactionWhereInput = {
  id?: string | StringFilter | null;
  date?: Date | DateTimeFilter | null;
  payee?: string | StringFilter | null;
  reference?: string | StringFilter | null;
  description?: string | StringFilter | null;
  additionalComments?: string | StringFilter | null;
  transactionSide?: DebitCredit | EnumDebitCreditFilter | null;
  amount?: Decimal | DecimalFilter | null;
  absoluteAmount?: Decimal | DecimalFilter | null;
  systemExchangeRate?: Decimal | DecimalFilter | null;
  categorisationStatus?:
    | CategorisationStatus
    | EnumCategorisationStatusFilter
    | null;
  bankAccountId?: string | StringFilter | null;
  bankTransactionBatchId?: string | StringFilter | null;
  ledgerTransactionId?: string | StringFilter | null;
  createdById?: string | StringFilter | null;
  updatedById?: string | StringFilter | null;
  createdAt?: Date | DateTimeFilter | null;
  updatedAt?: Date | DateTimeFilter | null;
  isDeleted?: boolean | BoolFilter | null;
  deletedAt?: Date | DateTimeFilter | null;

  AND?: BankTransactionWhereInput[] | null;
  OR?: BankTransactionWhereInput[] | null;
  NOT?: BankTransactionWhereInput[] | null;
};
