import type { Knex } from "knex";

exports.up = async (knex: Knex) => {
  await knex.schema.createTable("LedgerEntry", (table) => {
    table.uuid("id").notNullable();
    table.text("ledgerTransactionId").notNullable();
    table.date("fsDate").notNullable();
    table.text("coaId").notNullable();
    table.specificType("transactionSide", '"DebitCredit"').notNullable();
    table.text("sourceCurrencyId").notNullable();
    table.decimal("sourceAmount").notNullable();
    table.decimal("absoluteSourceAmount").notNullable();
    table.decimal("systemExchangeRate").notNullable();
    table.decimal("customExchangeRate").notNullable();
    table.decimal("amount").notNullable();
    table.decimal("absoluteAmount").notNullable();
    table
      .specificType("categorisationStatus", '"CategorisationStatus"')
      .notNullable()
      .defaultTo("AUTO_CATEGORISED");
    table.text("description");
    table.text("projectId");
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
    table.primary(["id", "fsDate"]);
  });

  await knex.raw('ALTER TABLE "LedgerEntry" PARTITION BY RANGE ("fsDate")');
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS ledger_entry_before_2024 
    PARTITION OF "LedgerEntry" 
    FOR VALUES FROM ('1970-01-01') TO ('2024-01-01');
    
    CREATE TABLE IF NOT EXISTS ledger_entry_2024 
    PARTITION OF "LedgerEntry" 
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
    
    CREATE TABLE IF NOT EXISTS ledger_entry_default 
    PARTITION OF "LedgerEntry" DEFAULT;
  `);
};

exports.down = async (knex: Knex) => {
  await knex.raw('DROP TABLE IF EXISTS "LedgerEntry" CASCADE');
};