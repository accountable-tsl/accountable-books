import { SpreadsheetImporterField } from "@/features/spreadsheets/types";

const fieldMatchers = {
  amount: ["*Amount", "Amount", "Amount*", "amount"],
  date: ["*Date", "Date", "Date*", "date"],
  payee: [
    "Contact / Payee",
    "Contact/Payee",
    "Payee",
    "payee",
    "contact",
    "contact / payee",
  ],
  description: ["Description", "description"],
  reference: ["Reference", "reference"],
  additionalComments: [
    "Additional Comments",
    "additional comments",
    "comments",
  ],
  coaCode: ["Account Code", "account code", "coa code"],
  coaName: ["Account Name", "account name", "coa name"],
};

export const bankTransactionImporterfields: SpreadsheetImporterField[] = [
  {
    label: "*Date",
    value: "date",
    required: true,
    possibleFields: fieldMatchers.date,
  },
  {
    label: "*Amount",
    value: "amount",
    required: true,
    possibleFields: fieldMatchers.amount,
  },
  {
    label: "Contact / Payee",
    value: "payee",
    possibleFields: fieldMatchers.payee,
  },
  {
    label: "Description",
    value: "description",
    possibleFields: fieldMatchers.description,
  },
  {
    label: "Reference",
    value: "reference",
    possibleFields: fieldMatchers.reference,
  },
  { label: "Additional Comments", value: "additionalComments" },
  {
    label: "Account Code",
    value: "coaCode",
    possibleFields: fieldMatchers.coaCode,
  },
  {
    label: "Account Name",
    value: "coaName",
    possibleFields: fieldMatchers.coaName,
  },
];
