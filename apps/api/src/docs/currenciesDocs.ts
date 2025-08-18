export const currenciesDocs = {
  '/currencies': {
    get: {
      summary: 'Retrieve all available currencies',
      description: 'Fetches a list of all currencies available in the system.',
      responses: {
        200: {
          description: 'A list of all currencies',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Currency' },
                  },
                },
              },
            },
          },
        },
        404: {
          description: 'No currencies found',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        500: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
};

export const currenciesSchemas = {
  Currency: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      code: { type: 'string', description: 'ISO 4217 currency code' },
      name: { type: 'string', description: 'Currency name' },
      symbol: { type: 'string', description: 'Currency symbol' },
    },
  },
};
