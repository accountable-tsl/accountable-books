/**
 * Environment File Generation CLI
 *
 * Shared CLI utilities for generating environment files from schema configurations.
 * Provides a unified interface for all apps in the monorepo.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Environment, EnvSchema } from './types.js';
import { generateEnvFiles } from './generator.js';

/**
 * Preserve existing values from a file if it exists
 */
function preserveExistingValues(generatedContent: string, existingFilePath: string): string {
  if (!fs.existsSync(existingFilePath)) {
    return generatedContent;
  }

  console.log(`📋 Preserving existing values in ${path.basename(existingFilePath)}...`);

  const existingContent = fs.readFileSync(existingFilePath, 'utf-8');
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
    // Preserve existing values if requested
    const finalContent = preserve ? preserveExistingValues(content, filePath) : content;

    // Write new file
    fs.writeFileSync(filePath, finalContent);
    console.log(`✅ Generated: ${fileName}`);
  } catch (error) {
    console.error(`❌ Failed to write ${fileName}:`, error);
    process.exit(1);
  }
}

/**
 * Create environment file generator for a specific service
 */
export async function createEnvGenerator(
  serviceName: string,
  schema: EnvSchema,
  targetEnvironments: Environment[],
  options: {
    blankStagingSecrets?: boolean;
    blankProductionSecrets?: boolean;
  } = {},
): Promise<void> {
  const { blankStagingSecrets = true, blankProductionSecrets = true } = options;

  console.log(`🔧 Generating ${serviceName} environment files...\n`);

  try {
    // Generate environment files for specified target environments
    const files = generateEnvFiles(schema, targetEnvironments, {
      blankStagingSecrets,
      blankProductionSecrets,
    });

    // Determine the package root (current working directory when called from config)
    const packageRoot = process.cwd();

    // Write each file
    for (const [fileName, content] of Object.entries(files)) {
      const filePath = path.join(packageRoot, fileName);
      // Preserve user values for local env and secrets files
      const shouldPreserve = fileName === '.env.local' || fileName.startsWith('.env.secrets.');

      writeEnvFile(filePath, content, shouldPreserve);
    }

    console.log(`\n🎉 All ${serviceName} environment files generated successfully!`);
    console.log('\n📝 Next steps:');
    console.log('   1. Review the generated files');
    console.log('   2. Update .env.local with your actual values if needed');
    console.log(
      '   3. Fill in .env.secrets.staging and .env.secrets.production with actual secrets',
    );
    console.log('   4. Commit .env.example to version control');
    console.log(
      '   5. Keep .env.local, .env.staging, .env.production, and .env.secrets.* in .gitignore',
    );
  } catch (error) {
    console.error(`❌ ${serviceName} environment file generation failed:`);
    console.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}
