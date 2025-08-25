export const bankAccountsDocs = {
  '/bankAccounts': {
    get: {
      summary: 'Retrieve all bank accounts for a company',
      responses: {
        200: {
          description: 'A list of bank accounts',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/BankAccount' },
                  },
                },
              },
            },
          },
        },
        404: {
          description: 'No bank accounts found',
        },
        500: {
          description: 'Internal server error',
        },
      },
    },
    post: {
      summary: 'Create a new bank account',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/BankAccountInput',
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Bank account created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BankAccountResponse' },
            },
          },
        },
        400: {
          description: 'Bad request (missing fields or invalid data)',
        },
        500: {
          description: 'Internal server error',
        },
      },
    },
  },
  '/bankAccounts/{id}': {
    get: {
      summary: 'Retrieve a single bank account by ID',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: {
        200: {
          description: 'Details of a single bank account',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BankAccountResponse' },
            },
          },
        },
        404: {
          description: 'Bank account not found',
        },
        500: {
          description: 'Internal server error',
        },
      },
    },
  },
};

export const bankAccountSchemas = {
  BankAccount: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      displayName: { type: 'string' },
      bankAccountType: { type: 'string' },
      bankAccountNo: { type: 'string' },
      bankBalance: { type: 'number' },
      lastReconciled: { type: 'string', format: 'date-time', nullable: true },
      bankId: { type: 'integer' },
      currencyId: { type: 'integer' },
      companyId: { type: 'integer' },
    },
  },
  BankAccountInput: {
    type: 'object',
    required: ['bankId', 'displayName', 'bankAccountType', 'bankAccountNo', 'currencyId'],
    properties: {
      bankId: { type: 'integer' },
      displayName: { type: 'string' },
      bankAccountType: { type: 'string' },
      bankAccountNo: { type: 'string' },
      currencyId: { type: 'integer' },
    },
  },
  BankAccountResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      message: { type: 'string' },
      data: { $ref: '#/components/schemas/BankAccount' },
    },
  },
};
