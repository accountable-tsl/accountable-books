import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import 'dotenv/config';
import { bankDocs, bankSchemas } from './bankDocs.js';
import { bankAccountSchemas, bankAccountsDocs } from './bankAccountsDocs.js';
import { coaDocs, coaSchemas } from './coaDocs.js';
import { companyDocs, companySchemas } from './companyDocs.js';
import { currenciesDocs, currenciesSchemas } from './currenciesDocs.js';
import { bankTransactionDocs, bankTransactionSchemas } from './bankTransactionsDocs.js';
import { ENV } from '../config/env.js';

const baseUrl = ENV.BACKEND_URL;

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Accountable Backend API (Internal)',
      version: '0.0.0',
      description: 'API documentation',
    },
    servers: [
      {
        url: baseUrl,
      },
    ],
    paths: {
      ...companyDocs,
      ...coaDocs,
      ...bankDocs,
      ...bankAccountsDocs,
      ...currenciesDocs,
      ...bankTransactionDocs,
    },
    components: {
      schemas: {
        ...companySchemas,
        ...coaSchemas,
        ...bankSchemas,
        ...bankAccountSchemas,
        ...currenciesSchemas,
        ...bankTransactionSchemas,
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};

const specs = swaggerJsdoc(options);

export { swaggerUi, specs };
