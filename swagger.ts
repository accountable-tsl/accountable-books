import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import "dotenv/config";
import { bankDocs, bankSchemas } from "./docs/bankDocs";
import { bankAccountSchemas, bankAccountsDocs } from "./docs/bankAccountsDocs";
import { coaDocs, coaSchemas } from "./docs/coaDocs";
import { companyDocs, companySchemas } from "./docs/companyDocs";
import { currenciesDocs, currenciesSchemas } from "./docs/currenciesDocs";
import { bankTransactionDocs, bankTransactionSchemas } from "./docs/bankTransactionsDocs";

const baseUrl = `${process.env.BACKEND_URL}:${process.env.PORT}`;

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Accountable Backend API (Internal)",
      version: "0.0.0",
      description: "API documentation",
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
      ...bankTransactionDocs
    },
    components: {
      schemas: {
        ...companySchemas,
        ...coaSchemas,
        ...bankSchemas,
        ...bankAccountSchemas,
        ...currenciesSchemas,
        ...bankTransactionSchemas
      },
    },
  },
  apis: ["./src/routes/*.ts"],
};

const specs = swaggerJsdoc(options);

export { swaggerUi, specs };
