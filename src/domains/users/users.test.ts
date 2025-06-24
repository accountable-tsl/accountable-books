import { jest } from "@jest/globals";
import { createUserDirect } from "./users.model";
import { NewUserDirect, NewUserInput } from "./users.types";
import { knexClient } from "../../../knexClient";
import knex from "knex";

const testKnex = knex({
  client: "sqlite3",
  connection: {
    filename: ":memory:",
  },
  useNullAsDefault: true,
  migrations: {
    directory: "./migrations",
  },
  seeds: {
    directory: "./seeds",
  },
});

beforeAll(async () => {
  await testKnex.migrate.rollback(undefined, true); // full rollback
  await testKnex.migrate.latest(); // fresh migrations
});

describe("domains/user", () => {
  describe("createUserDirect", () => {
    const validInput: NewUserDirect = {
      firstname: "Jane",
      lastname: "Kudi",
      email: "jane@example.com",
      password: "SuperSecure123!",
      status: "active",
      email_verified: true,
    };

    it("should return error for invalid input", async () => {
      await testKnex.transaction(async (trx) => {
        const invalidEmailInput = { ...validInput, email: "invalid-email.com" };
        expect(await createUserDirect(trx, invalidEmailInput)).toMatchObject({
          success: false,
        });

        const noPasswordInput = { ...validInput, password: "" };
        expect(await createUserDirect(trx, noPasswordInput)).toMatchObject({
          success: false,
        });

        const noFirstNameInput = { ...validInput, firstname: "" };
        expect(await createUserDirect(trx, noFirstNameInput)).toMatchObject({
          success: false,
        });
      });
    });

    it("should successfully create a new user with valid input", async () => {
      await testKnex.transaction(async (trx) => {
        const response = await createUserDirect(trx, validInput);
        console.log(response);
        expect(response).toMatchObject({
          success: true,
        });
      });
    });
  });
});

afterAll(async () => {
  await testKnex.destroy();
});
