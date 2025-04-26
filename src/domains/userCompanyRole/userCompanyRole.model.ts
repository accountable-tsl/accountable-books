import knex from "../../../knexClient";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { NewUserCompanyRole } from "./userCompanyRole.types";

export const getCompanyRolesForUser = async (userId: string) => {
  if (!userId?.trim()) {
    return errorResponse("Please provide a valid user ID");
  }

  const userRoleByCompany = await knex("users_companies_roles")
    .select("id", "user_id", "company_id", "role_id")
    .where({ user_id: userId, is_deleted: false });

  if (userRoleByCompany.length === 0) {
    return errorResponse("No user role found");
  }

  return successResponse<NewUserCompanyRole[]>(
    "User roles found",
    userRoleByCompany
  );
};
