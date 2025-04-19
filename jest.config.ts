/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

import type { Config } from "jest";
import { defaults } from "jest-config";

const config: Config = {
  // All imported modules in your tests should be mocked automatically
  // automock: false,
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts", ".tsx"],

  transform: { "^.+\\.[tj]sx?$": ["ts-jest", { useESM: true }] },
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  moduleFileExtensions: [...defaults.moduleFileExtensions, "mts"],

  coverageProvider: "v8",
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: "coverage",

  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  verbose: true,
};

export default config;
