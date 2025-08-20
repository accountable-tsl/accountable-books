#!/usr/bin/env tsx
/**
 * API Environment File Generator
 *
 * Generates all environment files from the centralized schema.
 * Usage: pnpm run generate-env
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateEnvFiles } from '@accountable-books/utils/env/generator';
import { API_ENV_SCHEMA, API_TARGET_FILES } from '../config/env-schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

/**
 * Preserve existing .env.local values if they exist
 */
function preserveLocalEnv(generatedContent: string, existingLocalPath: string): string {
  if (!fs.existsSync(existingLocalPath)) {
    return generatedContent;
  }

  console.log('📋 Preserving existing .env.local values...');

  const existingContent = fs.readFileSync(existingLocalPath, 'utf-8');
  const existingLines = existingContent.split('\n');
  const generatedLines = generatedContent.split('\n');

  // Create a map of existing non-comment values
  const existingValues = new Map<string, string>();
  for (const line of existingLines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        existingValues.set(key, valueParts.join('='));
      }
    }
  }

  // Replace generated values with existing ones where they exist
  const mergedLines = generatedLines.map((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key] = trimmed.split('=');
      if (key && existingValues.has(key)) {
        return `${key}=${existingValues.get(key)}`;
      }
    }
    return line;
  });

  return mergedLines.join('\n');
}

/**
 * Write environment file with backup and verification
 */
function writeEnvFile(filePath: string, content: string, preserve = false): void {
  const fileName = path.basename(filePath);

  try {
    // Preserve existing .env.local values
    const finalContent = preserve ? preserveLocalEnv(content, filePath) : content;

    // Create backup if file exists (disabled to avoid clutter)
    // if (fs.existsSync(filePath)) {
    //   const backupPath = `${filePath}.backup`;
    //   fs.copyFileSync(filePath, backupPath);
    //   console.log(`💾 Created backup: ${fileName}.backup`);
    // }

    // Write new file
    fs.writeFileSync(filePath, finalContent);
    console.log(`✅ Generated: ${fileName}`);
  } catch (error) {
    console.error(`❌ Failed to write ${fileName}:`, error);
    process.exit(1);
  }
}

/**
 * Main generation function
 */
function main(): void {
  console.log('🔧 Generating API environment files...\n');

  try {
    // Generate only specified environment files
    const files = generateEnvFiles(API_ENV_SCHEMA, API_TARGET_FILES);

    // Write each file
    for (const [fileName, content] of Object.entries(files)) {
      const filePath = path.join(packageRoot, fileName);
      const shouldPreserve = fileName === '.env.local';

      writeEnvFile(filePath, content, shouldPreserve);
    }

    console.log('\n🎉 All API environment files generated successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Review the generated files');
    console.log('   2. Update .env.local with your actual values if needed');
    console.log('   3. Commit .env.test and .env.example to version control');
    console.log('   4. Keep .env.local, .env.staging, .env.production in .gitignore');
  } catch (error) {
    console.error('❌ Environment file generation failed:');
    console.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Run the generator
main();
