import type { Knex } from "knex";

exports.up = async (knex: Knex) => {
  await knex.schema.createTable("BankTransaction", (table) => {
    table.uuid("id").notNullable();
    table.date("date").notNullable();
    table.text("payee");
    table.text("reference");
    table.text("description");
    table.text("additionalComments");
    table.specificType("transactionSide", '"DebitCredit"');
    table.decimal("amount").notNullable();
    table.decimal("absoluteAmount").notNullable().defaultTo(0);
    table.decimal("systemExchangeRate").notNullable();
    table
      .specificType("categorisationStatus", '"CategorisationStatus"')
      .notNullable()
      .defaultTo("UNCATEGORISED");
    table.text("bankAccountId").notNullable();
    table.text("bankTransactionBatchId");
    table.text("ledgerTransactionId");
    table.text("createdById").notNullable();
    table.text("updatedById");
    table
      .timestamp("createdAt", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updatedAt", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.timestamp("deletedAt", { useTz: true });
    table.boolean("isDeleted").notNullable().defaultTo(false);
    table.primary(["id", "date"]);
  });

  await knex.raw('ALTER TABLE "BankTransaction" PARTITION BY RANGE ("date")');
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS bank_transaction_before_2024 
    PARTITION OF "BankTransaction" 
    FOR VALUES FROM ('1970-01-01') TO ('2024-01-01');
    
    CREATE TABLE IF NOT EXISTS bank_transaction_2024 
    PARTITION OF "BankTransaction" 
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
    
    CREATE TABLE IF NOT EXISTS bank_transaction_default 
    PARTITION OF "BankTransaction" DEFAULT;
  `);
};

exports.down = async (knex: Knex) => {
  await knex.raw('DROP TABLE IF EXISTS "BankTransaction" CASCADE');
};
