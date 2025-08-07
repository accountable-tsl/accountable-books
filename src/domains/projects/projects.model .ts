import type { Knex } from "knex";
import {
  getProjectsParams,
  GetProjectsParams,
  newProjectInput,
  NewProjectInput,
  ProjectResponse,
  projectStatus,
  SortField,
  sortFields,
} from "./projects.types";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { getCompanyUUID } from "../../shared/utils/random.utils";
import { knexClient } from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import {
  createHybridSearch,
  defineSearchableColumns,
} from "../../shared/utils/search.utils";

export async function getProjects(
  input: GetProjectsParams
): Promise<ApiResponse<ProjectResponse>> {
  const parseInput = getProjectsParams.safeParse(input);
  if (!parseInput.success) {
    return errorResponse("Invalid request parameters", parseInput.error.errors);
  }

  const {
    companyId,
    ids,
    status,
    contactIds,
    search,
    page = 1,
    limit = 30,
    sortBy = "created_at",
    sortOrder = "desc",
    trx,
  } = parseInput.data;

  const searchableColumns = defineSearchableColumns("p", [
    { column: "name", weight: 2.0 },
    { column: "code", weight: 1.5 },
    { column: "description" },
    { column: "display_name", table: "c", name: "contactName", weight: 1.2 },
  ]);

  const { applySearchFilter, rankFields, rankOrder } = createHybridSearch({
    search,
    searchableColumns,
    trx,
    options: {
      minSimilarityThreshold: 0.25,
      fuzzyMinLength: 2,
    },
  });

  const query = async (tx: Knex.Transaction) => {
    const companyUUID = await getCompanyUUID(companyId, tx);
    if (!companyUUID) return errorResponse("Company not found");

    let baseQuery = tx("projects as p")
      .leftJoin("contacts as c", "p.contact_id", "c.id")
      .where("p.company_id", companyUUID)
      .andWhere("p.is_deleted", false);

    if (ids && ids.length > 0) {
      baseQuery = baseQuery.whereIn("p.id", ids);
    }

    if (status) {
      baseQuery = baseQuery.andWhere("p.status", status);
    }

    if (contactIds && contactIds.length > 0) {
      baseQuery = baseQuery.whereIn("p.contact_id", contactIds);
    }

    if (search?.trim()) baseQuery = applySearchFilter(baseQuery);

    const countResult = await baseQuery.clone().count("* as count").first();
    const total = Number(countResult?.count ?? 0);

    const offset = Math.max(0, (page - 1) * limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    if (page > totalPages) {
      return errorResponse(
        `Page ${page} exceeds maximum pages (${totalPages})`
      );
    }

    const selectFields: (string | Knex.Raw)[] = [
      "p.id",
      "p.name",
      "p.code",
      "p.description",
      "p.status",
      "p.contact_id as contactId",
      "c.display_name as contactName",
      "p.start_date as startDate",
      "p.end_date as endDate",
      "p.created_at as createdAt",
      ...rankFields,
    ];
    const orderByField = sortBy ?? "created_at";
    const sortFieldQualified = search ? "rank" : `p.${orderByField}`;
    const sortDirection = search ? "desc" : sortOrder;

    const orderClause = rankOrder ?? [sortFieldQualified, sortDirection];
    const projects = await baseQuery
      .select(selectFields)
      .orderBy(...orderClause)
      .limit(limit)
      .offset(offset);

    const pagination = {
      currentPage: page,
      pageSize: limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };

    if (total === 0 && page === 1) {
      return successResponse("No projects found", {
        projects: [],
        pagination: {
          ...pagination,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    return successResponse("Project(s) successfully fetched", {
      projects,
      pagination,
    });
  };

  try {
    const result = trx ? await query(trx) : await knexClient.transaction(query);
    return result;
  } catch (error) {
    return errorResponse("Failed to fetch project(s)", error);
  }
}

export async function addNewProjects({
  input,
  companyId,
  userId,
  trx,
}: {
  input: NewProjectInput[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ id: string; name: string }[]>> {
  const validate = newProjectInput
    .array()
    .safeParse(Array.isArray(input) ? input : [input]);

  if (!validate.success) {
    return errorResponse("Invalid input", validate.error.errors);
  }

  const data = validate.data;

  const query = async (tx: Knex.Transaction) => {
    const companyUUID = await getCompanyUUID(companyId, tx);
    if (!companyUUID) return errorResponse("Company not found");

    // Verify all contacts exist
    const contactIds = data
      .map((p) => p.contact_id)
      .filter((id): id is string => !!id);

    const validContactRows = await tx("contacts")
      .whereIn("id", contactIds)
      .andWhere("company_id", companyUUID)
      .select("id");

    const validContactIds = new Set(validContactRows.map((c) => c.id));

    const invalidContacts = data
      .filter((p) => p.contact_id && !validContactIds.has(p.contact_id))
      .map((p) => ({
        contactId: p.contact_id,
        projectName: p.name,
      }));

    if (invalidContacts.length > 0) {
      const errorDetails = invalidContacts
        .map((c) => `Contact ${c.contactId} for project "${c.projectName}"`)
        .join(", ");

      return errorResponse(`Invalid contact(s): ${errorDetails}`);
    }

    // Create data structure and insert
    const projects = data.map((project) => ({
      ...project,
      company_id: companyUUID,
      created_by_id: userId,
      updated_by_id: userId,
    }));

    const inserted = await tx("projects")
      .insert(projects)
      .returning(["id", "name"]);

    return successResponse(
      `Project${data.length > 1 ? "s" : ""} successfully created`,
      inserted
    );
  };

  try {
    const result = trx ? await query(trx) : await knexClient.transaction(query);
    return result;
  } catch (error: any) {
    return errorResponse("Failed to create project(s)", error);
  }
}
