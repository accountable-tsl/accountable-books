import type { Knex } from "knex";
import { NewFinancialStatementInput } from "../types/db";
import { financialStatementIds } from "./constants/ids";

type NewFinancialStatementWithId = NewFinancialStatementInput & { id: string };

export const defaultFinancialStatements: NewFinancialStatementWithId[] = [
  {
    id: financialStatementIds.is,
    key: "is",
    us_gaap_label: "Income Statement",
    ifrs_label: "Statement of Profit or Loss",
    default_label: "Profit & Loss",
  },
  {
    id: financialStatementIds.bs,
    key: "bs",
    us_gaap_label: "Balance Sheet",
    ifrs_label: "Statement of Financial Position",
    default_label: "Balance Sheet",
  },
  {
    id: financialStatementIds.cf,
    key: "cf",
    us_gaap_label: "Statement of Cash Flows",
    ifrs_label: "Statement of Cash Flows",
    default_label: "Cash Flow Statement",
  },
];

export async function seed(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx("financial_statement")
      .insert(defaultFinancialStatements)
      .onConflict("key")
      .ignore();

    if (process.env.NODE_ENV === "local" || NODE_ENV === "docker.dev") {
      console.log(
        `Seeded ${defaultFinancialStatements.length} financial statements`
      );
    }
  });
}
