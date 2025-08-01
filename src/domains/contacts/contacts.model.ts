import type { Knex } from "knex";
import { ApiResponse } from "../../core/types/api.types";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import {
  ContactInput,
  contactInputSchema,
  ContactResponse,
  UpdateContact,
  updateContactSchema,
} from "./contact.types";
import { knexClient } from "../../../knexClient";
import { getCompanyUUID } from "../../shared/utils/random.utils";

const normalizeName = (name: string) => name.trim().toLowerCase();

export async function addNewContacts({
  input,
  companyId,
  userId,
  trx,
}: {
  input: ContactInput[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<ContactResponse[]>> {
  const validate = contactInputSchema
    .array()
    .safeParse(Array.isArray(input) ? input : [input]);
  if (!validate.success) {
    return errorResponse("Invalid input", validate.error.errors);
  }

  const query = async (tx: Knex.Transaction) => {
    // Get company's UUID
    const companyUUID = await getCompanyUUID(companyId, tx);

    // Normalize names to verify uniqueness
    const normalizedNames = validate.data.map((c) =>
      normalizeName(c.display_name)
    );

    const existingContacts = await tx("contacts")
      .whereIn("normalized_name", normalizedNames)
      .andWhere("company_id", companyUUID)
      .select("display_name");

    if (existingContacts.length > 0) {
      const existingNames = existingContacts.map((c) => c.display_name);
      throw new Error(
        `Contact(s) with these names already exist: ${existingNames.join(", ")}`
      );
    }

    // Create data structure and insert
    const data = validate.data.map((contact) => ({
      ...contact,
      normalized_name: normalizeName(contact.display_name),
      company_id: companyUUID,
      created_by_id: userId,
      updated_by_id: userId,
    }));

    return await tx("contacts")
      .insert(data)
      .returning([
        "id",
        "display_name as displayName",
        "address",
        "email",
        "status",
        "notes",
      ]);
  };
  try {
    const result = trx ? await query(trx) : await knexClient.transaction(query);
    return successResponse("Contact created successfully", result);
  } catch (error: any) {
    if (error.message?.startsWith("Contact(s) with these names")) {
      return errorResponse(String(error.message), error);
    }
    return errorResponse("Failed to create contact", error);
  }
}

export async function getContacts({
  companyId,
  trx,
}: {
  companyId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<ContactResponse[]>> {
  if (!companyId) return errorResponse("Company ID is required");

  const query = async (tx: Knex.Transaction) => {
    const companyUUID = await getCompanyUUID(companyId, tx);

    return tx("contacts")
      .select([
        "id",
        "display_name as displayName",
        "address",
        "email",
        "status",
        "notes",
      ])
      .where({ company_id: companyUUID });
  };
  try {
    const result = trx ? await query(trx) : await knexClient.transaction(query);

    return result.length === 0
      ? successResponse("No contacts found", null)
      : successResponse("Contact(s) fetched successfully", result);
  } catch (error: any) {
    return errorResponse(`Failed to fetch contacts: ${error.message}`, error);
  }
}

export async function updateContacts({
  updates,
  companyId,
  userId,
  trx,
}: {
  updates: UpdateContact[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}) {
  const validate = updateContactSchema.array().safeParse(updates);
  if (!validate.success) {
    return errorResponse("Invalid input", validate.error.errors);
  }

  const query = async (tx: Knex.Transaction) => {
    const companyUUID = await getCompanyUUID(companyId, tx);

    // Verify all contacts exist
    const contactIds = validate.data.map((c) => c.id);
    const existingContacts = await tx("contacts")
      .whereIn("id", contactIds)
      .andWhere("company_id", companyUUID)
      .select("id");

    if (existingContacts.length !== contactIds.length) {
      const missingIds = contactIds.filter(
        (id) => !existingContacts.some((c) => c.id === id)
      );
      throw new Error(
        `Contact(s) with these IDs do not exist: ${missingIds.join(", ")}`
      );
    }

    // Check for display name uniqueness if any updates include display names
    const displayNamesToUpdate = validate.data
      .filter(
        (c) =>
          typeof c.display_name === "string" && c.display_name.trim() !== ""
      )
      .map((c) => c.display_name as string);

    if (displayNamesToUpdate.length > 0) {
      const normalizedNamesToUpdate = displayNamesToUpdate.map(normalizeName);

      // Check for duplicates within the batch itself
      const duplicatesInBatch = normalizedNamesToUpdate.filter(
        (name, index, arr) => arr.indexOf(name) !== index
      );
      if (duplicatesInBatch.length > 0) {
        throw new Error(
          `Duplicate names found in update batch: ${duplicatesInBatch.join(", ")}`
        );
      }

      // Check for conflicts with existing contacts (excluding those being updated)
      const duplicateContacts = await tx("contacts")
        .where("company_id", companyUUID)
        .whereIn("normalized_name", normalizedNamesToUpdate)
        .whereNotIn("id", contactIds) // Exclude contacts being updated
        .select("display_name");

      if (duplicateContacts.length > 0) {
        const duplicateNames = duplicateContacts.map((c) => c.display_name);
        throw new Error(
          `Contact(s) with these names already exist: ${duplicateNames.join(", ")}`
        );
      }
    }

    // Prepare update data with normalized names
    const updateData = validate.data.map((contact) => {
      const data: any = {
        id: contact.id,
        updated_by_id: userId,
        updated_at: tx.fn.now(),
      };

      // Only include fields that are explicitly provided
      if (contact.display_name !== undefined) {
        data.display_name = contact.display_name;
        data.normalized_name = normalizeName(contact.display_name);
      }
      if (contact.address !== undefined) data.address = contact.address;
      if (contact.email !== undefined) data.email = contact.email;
      if (contact.notes !== undefined) data.notes = contact.notes;
      if (contact.status !== undefined) data.status = contact.status;

      return data;
    });

    const updatePromises = updateData.map(async (data) => {
      const { id, ...updateFields } = data;
      const [updatedContact] = await tx("contacts")
        .where({ id, company_id: companyUUID })
        .update(updateFields)
        .returning([
          "id",
          "display_name as displayName",
          "address",
          "email",
          "status",
          "notes",
        ]);
      return updatedContact;
    });

    const updatedContacts = await Promise.all(updatePromises);
    return updatedContacts;
  };

  try {
    const result = trx ? await query(trx) : await knexClient.transaction(query);
    return successResponse("Contacts updated successfully", result);
  } catch (error: any) {
    if (error.message?.startsWith("Contact(s) with these names")) {
      return errorResponse(error.message);
    }
    if (error.message?.startsWith("Contact(s) with these IDs")) {
      return errorResponse(error.message);
    }
    return errorResponse("Failed to update contacts", error);
  }
}
