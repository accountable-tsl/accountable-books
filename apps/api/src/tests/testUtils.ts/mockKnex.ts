// test-utils/knex.mock.ts
import { jest } from "@jest/globals";
import type { Knex } from "knex";

// 1. Define a mock transaction
export const mockKnexTransaction = () => {
  const mock = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    first: jest.fn(),
    returning: jest.fn(),

    chain: function () {
      this.select.mockImplementation(() => this);
      this.where.mockImplementation(() => this);
      this.insert.mockImplementation(() => this);
      return this;
    },
  }.chain();

  return mock;
};

// 2. Define the main Knex mock
export const mockKnex = (): Knex => {
  const mock = {
    transaction: jest.fn(
      async (handler: (trx: Knex.Transaction) => Promise<any>) => {
        const trx = mockKnexTransaction();
        await handler(trx as any);
        return trx;
      }
    ),
  } as unknown as Knex;

  return mock;
};
