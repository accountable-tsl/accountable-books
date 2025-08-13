export const coaDocs = {
  "/coa": {
    get: {
      summary: "Retrieve the Chart of Accounts (COA) for a company",
      parameters: [
        {
          name: "page",
          in: "query",
          required: false,
          schema: { type: "integer" },
          description: "Page number for pagination",
        },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer" },
          description: "Number of results per page",
        },
        {
          name: "sortBy",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "Field to sort by (default: accountCode)",
        },
        {
          name: "sortOrder",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["asc", "desc"] },
          description: "Sort order (asc or desc)",
        },
      ],
      responses: {
        200: {
          description: "A list of COA entries",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                  data: {
                    type: "array",
                    items: { $ref: "#/components/schemas/COA" },
                  },
                },
              },
            },
          },
        },
        204: {
          description: "No accounts found",
        },
        500: {
          description: "Internal server error",
        },
      },
    },
    post: {
      summary: "Create a new COA entry",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/COAInput" },
          },
        },
      },
      responses: {
        201: {
          description: "COA entry created successfully",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/COAResponse" },
            },
          },
        },
        400: {
          description: "Bad request (missing fields or invalid data)",
        },
        500: {
          description: "Internal server error",
        },
      },
    },
  },
  "/coa/{id}": {
    get: {
      summary: "Retrieve a single COA entry by ID",
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer" },
          description: "The ID of the COA entry",
        },
      ],
      responses: {
        200: {
          description: "COA entry found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/COAResponse" },
            },
          },
        },
        204: {
          description: "COA entry not found",
        },
        500: {
          description: "Internal server error",
        },
      },
    },
    patch: {
      summary: "Update a COA entry",
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer" },
          description: "The ID of the COA entry",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/COAInput" },
          },
        },
      },
      responses: {
        200: {
          description: "COA entry updated successfully",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/COAResponse" },
            },
          },
        },
        400: {
          description: "Bad request (missing fields or invalid data)",
        },
        500: {
          description: "Internal server error",
        },
      },
    },
  },
  "/coa/check-code": {
    get: {
      summary: "Check if an account code is available",
      parameters: [
        {
          name: "accountCode",
          in: "query",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: {
          description: "Account code is available",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
        400: {
          description: "Bad request (missing or invalid account code)",
        },
        404: {
          description: "Account code not found",
        },
        500: {
          description: "Internal server error",
        },
      },
    },
  },
  "/coa/check-name": {
    get: {
      summary: "Check if an account name is available",
      parameters: [
        {
          name: "accountName",
          in: "query",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: {
          description: "Account name is available",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
        400: {
          description: "Bad request (missing or invalid account name)",
        },
        404: {
          description: "Account name not found",
        },
        500: {
          description: "Internal server error",
        },
      },
    },
  },
};

export const coaSchemas = {
  COA: {
    type: "object",
    properties: {
      id: { type: "integer" },
      accountCode: { type: "string", nullable: true },
      accountName: { type: "string" },
      description: { type: "string", nullable: true },
      accountTypeId: { type: "integer" },
      defaultSide: { type: "string" },
      currencyId: { type: "integer" },
      companyId: { type: "integer" },
    },
  },
  COAInput: {
    type: "object",
    required: ["accountName", "accountTypeId", "currencyId"],
    properties: {
      accountName: { type: "string" },
      accountCode: { type: "string" },
      description: { type: "string" },
      accountTypeId: { type: "integer" },
      defaultSide: { type: "string" },
      currencyId: { type: "integer" },
    },
  },
  COAResponse: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      message: { type: "string" },
      data: { $ref: "#/components/schemas/COA" },
    },
  },
};
