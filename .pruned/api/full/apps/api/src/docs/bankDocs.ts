export const bankDocs = {
  '/banks': {
    get: {
      summary: 'Retrieve a list of banks',
      responses: {
        200: {
          description: 'A list of banks',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Bank' },
                  },
                },
              },
            },
          },
        },
        404: {
          description: 'No banks found',
        },
      },
    },
    post: {
      summary: 'Create a new bank',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/BankInput',
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Bank created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BankResponse' },
            },
          },
        },
        400: {
          description: 'Bad request (missing fields or invalid data)',
        },
      },
    },
  },
  '/banks/{id}': {
    get: {
      summary: 'Get a single bank by ID',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'integer' },
        },
      ],
      responses: {
        200: {
          description: 'Details of a single bank',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BankResponse' },
            },
          },
        },
        404: { description: 'Bank not found' },
      },
    },
    put: {
      summary: 'Update an existing bank',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'integer' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/BankInput' },
          },
        },
      },
      responses: {
        200: {
          description: 'Bank updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BankResponse' },
            },
          },
        },
        400: { description: 'Bad request (missing fields or invalid data)' },
        404: { description: 'Bank not found' },
      },
    },
  },
};

export const bankSchemas = {
  Bank: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      bankLogo: { type: 'string', nullable: true },
      countryId: { type: 'integer' },
    },
  },
  BankInput: {
    type: 'object',
    required: ['name', 'countryId'],
    properties: {
      name: { type: 'string' },
      bankLogo: { type: 'string' },
      countryId: { type: 'integer' },
    },
  },
  BankResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      message: { type: 'string' },
      data: { $ref: '#/components/schemas/Bank' },
    },
  },
};
