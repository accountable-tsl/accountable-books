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

  // Parse existing values
  const existingValues = new Map<string, string>();
  const existingLines = existingContent.split('\n');
  for (const line of existingLines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        // Only preserve non-empty values
        if (value !== '') {
          existingValues.set(key.trim(), value);
        }
      }
    }
  }

  console.log(`   Found ${existingValues.size} existing values to preserve`);

  // Parse generated content and replace values with existing ones
  const generatedLines = generatedContent.split('\n');
  let preservedCount = 0;

  const mergedLines = generatedLines.map((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const keyTrimmed = key.trim();
        if (existingValues.has(keyTrimmed)) {
          // Preserve the existing value
          preservedCount++;
          return `${keyTrimmed}=${existingValues.get(keyTrimmed)}`;
        }
      }
    }
    return line;
  });

  console.log(`   Preserved ${preservedCount} values from existing file`);
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

    // Check if any files were generated
    const fileCount = Object.keys(files).length;
    if (fileCount === 0) {
      console.log(
        `ℹ️  No environment files generated for ${serviceName} (schema has no applicable variables)`,
      );
      return;
    }

    // Write each file
    for (const [fileName, content] of Object.entries(files)) {
      const filePath = path.join(packageRoot, fileName);
      // Preserve user values for all environment files except .env.example
      const shouldPreserve = fileName !== '.env.example';

      if (shouldPreserve && fs.existsSync(filePath)) {
        console.log(`🔄 Updating ${fileName} (preserving existing values)...`);
      } else {
        console.log(`📝 Creating ${fileName}...`);
      }

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
