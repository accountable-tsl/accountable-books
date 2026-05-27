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
              required: [
                'startDate',
                'endDate',
                'bankAccountId',
                'bankTransactions',
                'createdById',
              ],
              properties: {
                startDate: {
                  type: 'string',
                  format: 'date',
                  description: 'The start date for the transaction batch.',
                },
                endDate: {
                  type: 'string',
                  format: 'date',
                  description: 'The end date for the transaction batch.',
                },
                source: {
                  type: 'string',
                  enum: ['FILE_IMPORT', 'BANK_FEED', 'MANUAL_ENTRY'],
                  description: 'The source of the transactions.',
                  default: 'FILE_IMPORT',
                },
                bankAccountId: {
                  type: 'string',
                  description:
                    'The ID of the bank account the transactions are associated with.',
                },
                bankTransactions: {
                  type: 'array',
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
                createdById: {
                  type: 'string',
                  description:
                    'The ID of the user creating the transaction batch.',
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
      startDate: {
        type: 'string',
        format: 'date',
        description: 'Start date of the batch.',
      },
      endDate: {
        type: 'string',
        format: 'date',
        description: 'End date of the batch.',
      },
      source: {
        type: 'string',
        enum: ['FILE_IMPORT', 'BANK_FEED', 'MANUAL_ENTRY'],
        description: 'Source of the transactions.',
      },
      balanceBefore: {
        type: 'number',
        format: 'decimal',
        description: 'Balance before the batch.',
      },
      balanceAfter: {
        type: 'number',
        format: 'decimal',
        description: 'Balance after the batch.',
      },
      bankAccountId: {
        type: 'string',
        description: 'Associated bank account ID.',
      },
      createdById: {
        type: 'string',
        description: 'ID of the user who created the batch.',
      },
      bankTransactions: {
        type: 'array',
        items: { $ref: '#/components/schemas/BankTransaction' },
        description: 'List of transactions in the batch.',
      },
    },
  },
};
