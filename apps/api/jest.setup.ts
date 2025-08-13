import { jest } from "@jest/globals";
import { mockDeep } from "jest-mock-extended";
import type { Knex } from "knex";


// Mock dayjs
jest.mock("dayjs", () => {
  const mockDayjs = jest.fn(() => ({
    add: jest.fn().mockReturnThis(),
    toDate: jest.fn(() => new Date("2023-01-01T00:00:00Z")),
  }));
  return mockDayjs;
});

// Mock crypto utils
jest.mock("./src/shared/utils/crypto.utils", () => {
  const originalModule = jest.requireActual("./src/shared/utils/crypto.utils");
  return {
    __esModule: true,
    ...(originalModule as Record<string, unknown>),
    generateRandomToken: jest.fn(() => "mock-token"),
    hashToken: jest.fn((token) => `hashed-${token}`),
    hashPassword: jest.fn(() => "hashed-password"),
  };
});

// // Mock email service
// jest.mock("./src/domains/communications/email.service", () => ({
//   sendVerificationEmail: jest.fn(() => Promise.resolve()),
// }));
