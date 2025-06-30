import type { Knex } from "knex";
import { ApiResponse } from "../../core/types/api.types";
import {
  AccFirm,
  AccFirmCamelResponse,
  AccFirmWithId,
  NewAccFirm,
  newAccFirm,
} from "./firms.types";
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { knexClient } from "../../../knexClient";
import { getCompanyUUID } from "../../shared/utils/random.utils";
import { redis } from "../../lib/redis";
import { firmSlugRedisKey, isReservedSlug, isValidSlug } from "./firms.utils";
import { isA } from "jest-mock-extended";
import { snakeToCamel } from "../../shared/utils/formatting.utils";

export const resolveFirm = async (
  trx: Knex.Transaction,
  firmId?: string
): Promise<string> => {
  if (firmId) {
    const [verifyFirm] = await trx("accounting_firms_meta")
      .where("id", firmId)
      .select("id");

    if (verifyFirm) {
      return verifyFirm.id;
    }
  }

  const platformFirm = await trx("accounting_firms_meta as af")
    .join("companies as c", "af.company_id", "c.id")
    .where("c.is_platform", true)
    .select("af.id");

  if (!platformFirm || platformFirm.length > 1) {
    throw new Error("Unable to resolve firm to assign");
  }
  return platformFirm[0].id;
};

export const createAccountingFirm = async (
  knexTrx: Knex,
  input: NewAccFirm
): Promise<ApiResponse<AccFirmWithId>> => {
  const validatedInput = newAccFirm.safeParse(input);

  if (!validatedInput.success) {
    return errorResponse("Invalid input", validatedInput.error.flatten());
  }
  const { data } = validatedInput;

  try {
    const [newFirm] = await knexTrx("accounting_firms_meta")
      .insert(data)
      .returning("*");

    if (!newFirm) return errorResponse("Failed to create firm");
    const { company_id: id, ...rest } = newFirm;

    return successResponse("Accounting firm successfully created", {
      id,
      ...rest,
    });
  } catch (error) {
    return errorResponse("Unknown error occured", error);
  }
};

export const getSlugs = async (): Promise<ApiResponse<string[]>> => {
  try {
    const slugs = await knexClient("accounting_firms_meta")
      .pluck("slug")
      .whereNotNull("slug")
      .where("deleted_at", null)
      .where("is_deleted", false);

    if (!slugs || slugs.length === 0) {
      return errorResponse("No slugs found");
    }

    return successResponse("Slugs retrieved successfully", slugs);
  } catch (error) {
    return errorResponse("Error retrieving slugs", error);
  }
};

export const checkSlug = async ({
  slug,
  companyId,
}: {
  slug: string;
  companyId: string;
}): Promise<ApiResponse<{ isAvailable: boolean; isCurrent?: boolean }>> => {
  if (!slug || typeof slug !== "string") {
    return errorResponse("Missing or invalid slug");
  }

  if (!isValidSlug(slug)) {
    return errorResponse(
      "Invalid format. Slug must be 3-20 characters long, lowercase, and can contain hyphens."
    );
  }

  const redisKey = firmSlugRedisKey(slug);

  try {
    // Get actual company UUID
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse("Invalid company ID");
    }

    // Check Redis cache
    const cachedCompanyId = await redis.get(redisKey);

    // Slug is cached and belongs to this company
    if (cachedCompanyId && cachedCompanyId === companyUUID) {
      return successResponse("Current slug.", {
        isAvailable: true,
        isCurrent: true,
      });
    }

    // Slug is taken by another company
    if (cachedCompanyId) {
      return successResponse("Slug has been taken", {
        isAvailable: false,
        isCurrent: false,
      });
    }

    //  Slug not in cache, Check database
    const exists = await knexClient("accounting_firms_meta")
      .where({ slug })
      .first();

    // Cache result
    if (exists) {
      await redis.set(
        redisKey,
        exists.company_id || "NULL",
        "EX",
        60 * 60 * 24 // Cache for 24 hours
      );

      const isCurrent = exists.company_id === companyUUID;
      return successResponse(
        isCurrent ? "Current slug." : "Slug has been taken",
        {
          isAvailable: isCurrent,
          isCurrent,
        }
      );
    }

    return successResponse("Slug is available", {
      isAvailable: true,
      isCurrent: false,
    });
  } catch (error) {
    return errorResponse("Error checking slug existence", error);
  }
};

export const updateFirm = async (
  trx: Knex.Transaction,
  id: string,
  data: Partial<NewAccFirm>
): Promise<ApiResponse<AccFirmCamelResponse>> => {
  try {
    if (!id || typeof id !== "string") {
      return errorResponse("Invalid or missing company ID");
    }

    if (!data || typeof data !== "object") {
      return errorResponse("Nothing to update");
    }

    if (data.slug && isReservedSlug(data.slug)) {
      return errorResponse("Slug is reserved");
    }

    if (data.slug && !isValidSlug(data.slug)) {
      return errorResponse(
        "Invalid format. Slug must be 3-20 characters long, lowercase, and can contain hyphens."
      );
    }

    const companyUUID = await getCompanyUUID(id, trx);
    if (!companyUUID) {
      throw new Error("Invalid company ID");
    }

    const [firm, company] = await Promise.all([
      trx("accounting_firms_meta").where("company_id", companyUUID).first(),
      trx("companies").where("id", companyUUID).first(),
    ]);

    if (!firm) {
      return errorResponse("Firm not found", null, {
        code: ErrorCode.NOT_FOUND,
      });
    }

    if (!company) {
      return errorResponse("Company not found", null, {
        code: ErrorCode.NOT_FOUND,
      });
    }

    if (company.is_platform) {
      return errorResponse("Cannot update", null, {
        code: ErrorCode.FORBIDDEN,
      });
    }

    const validatedData = newAccFirm.partial().safeParse(data);
    if (!validatedData.success) {
      return errorResponse(validatedData.error.message);
    }

    const [updatedFirm] = await trx("accounting_firms_meta")
      .where({ company_id: companyUUID })
      .update(validatedData.data)
      .returning(["company_id", "slug", "firm_type"]);

    const oldSlug = firm.slug;
    const newSlug = validatedData.data.slug || oldSlug;
    if (newSlug !== oldSlug) {
      const oldRedisKey = firmSlugRedisKey(oldSlug);
      const newRedisKey = firmSlugRedisKey(newSlug);

      await redis.del(oldRedisKey);
      await redis.set(newRedisKey, companyUUID, "EX", 60 * 60 * 24);
    }

    const result = snakeToCamel(updatedFirm);
    return successResponse("Firm updated successfully", result);
  } catch (error) {
    return errorResponse("Internal server error", error);
  }
};
