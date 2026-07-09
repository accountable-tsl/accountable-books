export const bankTransactionDocs = {
  '/bank-accounts/transactions/import': {
    post: {
      summary: 'Import bank transactions for a specific bank account',
      description:
        'Allows the import of bank transactions into the system, with support for batch processing and balance recalculation.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['source', 'bank_account_id', 'bank_transactions'],
              properties: {
                source: {
                  type: 'string',
                  enum: ['file_import', 'bank_feed', 'manual_entry'],
                  description: 'The source of the transactions.',
                },
                bank_account_id: {
                  type: 'string',
                  format: 'uuid',
                  description:
                    'The ID of the bank account the transactions are associated with.',
                },
                bank_transactions: {
                  type: 'array',
                  minItems: 1,
                  items: {
                    type: 'object',
                    required: ['date', 'amount'],
                    properties: {
                      date: {
                        type: 'string',
                        format: 'date-time',
                        description: 'The transaction date.',
                      },
                      description: {
                        type: 'string',
                        nullable: true,
                        description: 'A brief description of the transaction.',
                      },
                      amount: {
                        type: 'number',
                        format: 'decimal',
                        description: 'The transaction amount.',
                      },
                      payee: {
                        type: 'string',
                        nullable: true,
                        description: 'The payee for the transaction.',
                      },
                      reference: {
                        type: 'string',
                        nullable: true,
                        description:
                          'A reference identifier for the transaction.',
                      },
                      type: {
                        type: 'string',
                        nullable: true,
                        description:
                          "The transaction type (e.g., 'credit', 'debit').",
                      },
                    },
                  },
                },
                source_metadata: {
                  type: 'object',
                  additionalProperties: true,
                  description: 'Metadata describing the import source.',
                },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Bank transactions imported successfully.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'object',
                    properties: {
                      bankTransactionBatch: {
                        type: 'object',
                        description:
                          'Details of the created transaction batch.',
                        $ref: '#/components/schemas/BankTransactionBatch',
                      },
                    },
                  },
                },
              },
            },
          },
        },
        400: {
          description: 'Bad request due to missing or invalid fields.',
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
          description: 'Internal server error.',
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
  '/bank-accounts/transactions/batches/{batchId}/reverse': {
    post: {
      summary: 'Reverse an imported bank transaction batch',
      parameters: [
        {
          name: 'batchId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reason'],
              properties: {
                reason: {
                  type: 'string',
                  minLength: 1,
                  maxLength: 512,
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Bank transaction batch reversed.' },
        400: { description: 'Invalid request or batch cannot be reversed.' },
      },
    },
  },
};

export const bankTransactionSchemas = {
  BankTransaction: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Transaction ID.' },
      date: {
        type: 'string',
        format: 'date-time',
        description: 'Transaction date.',
      },
      description: {
        type: 'string',
        nullable: true,
        description: 'Transaction description.',
      },
      amount: {
        type: 'number',
        format: 'decimal',
        description: 'Transaction amount.',
      },
      payee: {
        type: 'string',
        nullable: true,
        description: 'Transaction payee.',
      },
      reference: {
        type: 'string',
        nullable: true,
        description: 'Transaction reference.',
      },
      type: {
        type: 'string',
        nullable: true,
        description: 'Transaction type.',
      },
      balance: {
        type: 'number',
        format: 'decimal',
        description: 'Running balance after the transaction.',
      },
      bankAccountId: {
        type: 'string',
        description: 'Associated bank account ID.',
      },
    },
  },
  BankTransactionBatch: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Batch ID.' },
      start_date: {
        type: 'string',
        format: 'date',
        description: 'Start date of the batch.',
      },
      end_date: {
        type: 'string',
        format: 'date',
        description: 'End date of the batch.',
      },
      source: {
        type: 'string',
        enum: ['file_import', 'bank_feed', 'manual_entry'],
        description: 'Source of the transactions.',
      },
      bank_account_id: {
        type: 'string',
        description: 'Associated bank account ID.',
      },
      created_by_id: {
        type: 'string',
        description: 'ID of the user who created the batch.',
      },
      status: {
        type: 'string',
        enum: ['active', 'reversed'],
      },
      reversed_by_id: {
        type: 'string',
        nullable: true,
      },
      reversed_at: {
        type: 'string',
        format: 'date-time',
        nullable: true,
      },
      reversal_reason: {
        type: 'string',
        nullable: true,
      },
    },
  },
};
