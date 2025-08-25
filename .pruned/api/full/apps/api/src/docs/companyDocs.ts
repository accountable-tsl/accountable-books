export const companyDocs = {
  '/companies': {
    post: {
      summary: 'Create a new company',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/CompanyInput',
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Company created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CompanyResponse' },
            },
          },
        },
        400: {
          description: 'Bad request (missing or invalid data)',
        },
        500: {
          description: 'Internal server error',
        },
      },
    },
  },
};

export const companySchemas = {
  Company: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      website: { type: 'string', nullable: true },
      industry: { type: 'string', nullable: true },
      teamSize: { type: 'string', nullable: true },
      revenue: { type: 'string', nullable: true },
      countryId: { type: 'integer' },
      reportingCurrencyId: { type: 'integer' },
      createdById: { type: 'integer' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  CompanyInput: {
    type: 'object',
    required: ['name', 'countryId', 'reportingCurrencyId', 'createdById'],
    properties: {
      name: { type: 'string' },
      website: { type: 'string', nullable: true },
      industry: { type: 'string', nullable: true },
      teamSize: { type: 'string', nullable: true },
      revenue: { type: 'string', nullable: true },
      countryId: { type: 'integer' },
      reportingCurrencyId: { type: 'integer' },
      createdById: { type: 'integer' },
    },
  },
  CompanyResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      message: { type: 'string' },
      data: { $ref: '#/components/schemas/Company' },
    },
  },
};
