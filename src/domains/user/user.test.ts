import { jest } from "@jest/globals";
import type { Knex } from "knex";
import { mockKnexTransaction } from "../../tests/testUtils.ts/mockKnex";
import { createUserDirect } from "./user.model";
import { NewUserInput } from "./user.types";
import { ApiResponse } from "../../core/types/api.types";

describe("domains/user", () => {
  // const trx = mockKnexTransaction() as unknown as Knex.Transaction;
  const trx = {} as Knex.Transaction;

  describe("createUserDirect", () => {
    const validInput: NewUserInput = {
      firstname: "Jane",
      lastname: "Kudi",
      email: "jane@example.com",
      password: "SuperSecure123!",
    };

    it("should return error for invalid input", async () => {
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

    it("should throw an error if user already exists", async () => {});

    it("should successfully create a new user with valid input", async () => {
      const response = await createUserDirect(trx, validInput);

      expect(response).toMatchObject<ApiResponse>({
        ...response,
        success: true,
      });
    });
  });
});
