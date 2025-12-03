import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginReact from 'eslint-plugin-react';
import { defineConfig } from 'eslint/config';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default defineConfig([
  // Global config
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    plugins: {
      js,
      'simple-import-sort': simpleImportSort,
    },
    extends: ['js/recommended'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },

  // React-only config
  {
    files: ['apps/web/**/*.{jsx,tsx}'],
    plugins: {
      react: pluginReact,
    },
    ...pluginReact.configs.flat.recommended,
  },

  tseslint.configs.recommended,
]);
