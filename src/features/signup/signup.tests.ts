// import { mockDeep } from "jest-mock-extended";
// import { Knex } from "knex";
// import { createUserDirect } from "../../domains/user/user.model";
// import { createCompany } from "../../domains/company/company.model";
// import { createAccountingFirm } from "../../domains/accountingFirm/accountingFirm.model";
// import { onboardingAccountingFirm } from "./onboarding.service";

// // Create fake database
// const mockKnex = mockDeep<Knex>();

// // Valid input in camelCase
// const validInput = {
//   user: {
//     email: "test@firm.com",
//     password: "ValidPass123!",
//     firstname: "Test",
//     lastname: "users",
//   },
//   company: {
//     legalName: "Test Firm LLC",
//     type: "accounting_firms",
//     reportingCurrencyId: "1d6a1e31-7e36-4eab-94e1-11f2173ea972", // Real UUID
//     countryId: "9bcb8a51-43e4-4875-aa8b-119465e8b18d", // Real UUID
//   },
//   firm: {
//     legalName: "Test Firm",
//     taxId: "123-456",
//   },
// };

// // jest.mock("../../domains/user/user.model", () => ({
// //   createUserDirect: jest.fn().mockResolvedValue({
// //     success: true,
// //     data: { id: "user-1", email: "test@firm.com" },
// //   }),
// // }));

// // jest.mock("../../domains/company/company.model", () => ({
// //   createCompany: jest.fn().mockResolvedValue({
// //     success: true,
// //     data: { id: "company-1" },
// //   }),
// // }));

// // jest.mock("../../domains/accounting-firm/accountingFirm.model", () => ({
// //   createAccountingFirm: jest.fn().mockResolvedValue({
// //     success: true,
// //     data: { id: "firm-1" },
// //   }),
// // }));

// // Set up the test environment
// describe("onboardingAccountingFirm", () => {
//   beforeEach(() => {
//     jest.clearAllMocks(); // Clean the "oven" between cakes

//     // Tell jest to use toy versions of helpers
//     // Define expected success response
//     (createUserDirect as jest.Mock).mockResolvedValue({
//       success: true,
//       data: { id: "user-1", email: "test@firm.com" },
//     });

//     (createCompany as jest.Mock).mockResolvedValue({
//       success: true,
//       data: { id: "company-1" },
//     });

//     (createAccountingFirm as jest.Mock).mockResolvedValue({
//       success: true,
//       data: { id: "firm-1" },
//     });

//     mockKnex.transaction.mockImplementation(async (trxFn: any) => {
//       const fakeTrx = mockDeep<Knex.Transaction>();
//       fakeTrx.select.mockResolvedValue([{ id: "role-1" }]);
//       return trxFn(fakeTrx);
//     });
//   });

//   // Actual tests
//   test("converts input to snake_case", async () => {
//     await onboardingAccountingFirm(mockKnex, validInput);
//     expect(createCompany).toHaveBeenCalledWith(
//       expect.anything(),
//       expect.objectContaining({
//         // Notice snake_case keys here
//         legal_name: "Test Firm LLC",
//         reporting_currency_id: expect.any(String),
//       })
//     );
//   });

//   test("successful onboarding creates all entities (user, company, firm and perhaps coa) and tracks events", async () => {
//     const result = await onboardingAccountingFirm(mockKnex, validInput);

//     // Verify successful response
//     expect(result).toEqual({
//       success: true,
//       message: "Accounting firm onboarded successfully",
//       data: {
//         user: expect.anything(),
//         company: expect.anything(),
//         firm: expect.anything(),
//         coa: expect.anything(),
//       },
//     });

//     // Verify helpers were used correctly
//     expect(createUserDirect).toHaveBeenCalledWith(
//       expect.anything(), // Fake transaction
//       expect.any(Object)
//     );
//     expect(createCompany).toHaveBeenCalledWith(
//       expect.anything(),
//       expect.objectContaining({
//         legal_name: "Test Firm LLC",
//         display_name: "Test Firm HQ", // Verify naming fallback
//         type: "accounting_firms",
//         created_by_id: "user-1",
//         reporting_currency_id: "1d6a1e31-7e36-4eab-94e1-11f2173ea972",
//         country_id: "9bcb8a51-43e4-4875-aa8b-119465e8b18d",
//       })
//     );
//     expect(createAccountingFirm).toHaveBeenCalledWith(expect.anything(), {
//       legal_name: "Test Firm",
//       company_id: "company-1",
//       display_name: "Test Firm LLC", // Should use company legal name
//     });

//     // Verify event tracking after transaction
//     const { trackEvent } = require("../tracking");
//     expect(trackEvent).toHaveBeenCalledWith(
//       "User Signed Up",
//       "user-1",
//       expect.objectContaining({ role: "admin" })
//     );
//   });

//   test("rolls back transaction on user creation failure", async () => {
//     (createUserDirect as jest.Mock).mockResolvedValue({
//       success: false,
//       error: "Email exists",
//     });

//     const response = await onboardingAccountingFirm(mockKnex, validInput);

//     expect(response).toHaveProperty("success", false);
//     expect(createCompany).not.toHaveBeenCalled();
//     expect(mockKnex.transaction).toHaveBeenCalled();

//     // Verify Sentry capture
//     const Sentry = require("../sentry");
//     expect(Sentry.captureException).toHaveBeenCalledWith(
//       expect.any(Error),
//       expect.objectContaining({
//         tags: { flow: "onboardingAccountingFirm" },
//       })
//     );
//   });

//   test("handles missing admin role", async () => {
//     mockKnex.transaction.mockImplementationOnce(async (trxFn: any) => {
//       const trx = mockDeep<Knex.Transaction>();
//       trx.select.mockResolvedValue([]); // No roles found
//       return trxFn(trx);
//     });

//     const response = await onboardingAccountingFirm(mockKnex, validInput);
//     expect(response).toHaveProperty("error", "Admin role not found");
//   });

//   test("validates input using zod schema", async () => {
//     const invalidInput = {
//       user: { email: "bad-email" }, // Missing required fields
//       company: { type: "invalid" },
//       firm: {},
//     };

//     const response = await onboardingAccountingFirm(mockKnex, invalidInput);
//     expect(response).toHaveProperty("success", false);
//     expect(response.error).toMatch(/invalid.*input/i);
//   });
// });

// Sample test
test("sample test", () => {
  expect(true).toBe(true);
});
