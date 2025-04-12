import knexInstance from "../../knexClient";
import { createCompany } from "../models/company.model";
import { createUserDirect } from "../models/user.model";
import {
  onboardingDirectClient,
  OnboardingDirectClient,
} from "../types/onboarding";
import { camelToSnake, errorResponse } from "../utils/utils";

export const onboardingClientDirect = async (input: OnboardingDirectClient) => {
  const snakeInput = camelToSnake(input);
  const validateInput = onboardingDirectClient.safeParse(snakeInput);

  if (!validateInput.success) {
    return errorResponse("Invalid input", validateInput.error.format());
  }

  try {
    return await knexInstance.transaction(async (trx) => {
      // Create user
      const user = await createUserDirect(trx, validateInput.data);
      if (!user.success) {
        return errorResponse("User creation failed", user.error);
      }

      // Create company
      const company = await createCompany(trx, {
        ...validateInput.data.company,
        created_by_id: user.data.id,
      });
      if (!company.success) {
        return errorResponse("Company creation failed", company.error);
      }

      // Assign user-company-role.
      // User is a client if they hit this endpoint
      const [role] = await trx("role").where({ name: "client" });
      await trx("user_company_role").insert({
        user_id: user.data.id,
        company_id: company.data.id,
        role_id: role.id,
      });

      
      // User selected cOA, attach selected, otherwise, try to determine and then attach, attach COA Template if required

      // Assign to accounting firm, platform firm if no accounting firm
    });
  } catch (error) {}
};

export const onboardingAccountingFirm = async (input: any) => {
  // Validate input
  // Create user
  // Create company
  // User, Company Successful? User, Company, Role
  // Attach COA Template to Company if required
  // Create accounting firm
  // Link company to accounting firm in accounting firm table
  // Assign accounting firm to company in company table
};
