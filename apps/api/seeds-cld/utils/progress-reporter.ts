import type { ProgressCallback, ProgressUpdate, SeedExecutionResult } from './types.js';

export class ProgressReporter {
  private verbose: boolean;
  private startTime: Date;
  private operations: Map<string, { current: number; total: number; startTime: Date }> = new Map();

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
    this.startTime = new Date();
  }

  // Start tracking an operation
  startOperation(operation: string, total: number): void {
    this.operations.set(operation, {
      current: 0,
      total,
      startTime: new Date(),
    });

    if (this.verbose) {
      console.log(`🚀 Starting: ${operation} (${total} items)`);
    }
  }

  // Update progress for an operation
  updateProgress(operation: string, current: number, message?: string): void {
    const op = this.operations.get(operation);
    if (!op) return;

    op.current = current;
    this.operations.set(operation, op);

    if (this.verbose || current === op.total) {
      const percentage = Math.round((current / op.total) * 100);
      const progressBar = this.createProgressBar(current, op.total);
      const status = current === op.total ? '✅' : '⏳';

      console.log(
        `${status} ${operation}: ${progressBar} ${percentage}% (${current}/${op.total})${message ? ` - ${message}` : ''}`,
      );
    }
  }

  // Complete an operation
  completeOperation(operation: string, message?: string): void {
    const op = this.operations.get(operation);
    if (!op) return;

    const duration = Date.now() - op.startTime.getTime();
    const durationStr = this.formatDuration(duration);

    console.log(
      `✅ Completed: ${operation} (${op.total} items in ${durationStr})${message ? ` - ${message}` : ''}`,
    );
    this.operations.delete(operation);
  }

  // Report an error
  reportError(operation: string, error: Error | string): void {
    const errorMsg = error instanceof Error ? error.message : error;
    console.error(`❌ Error in ${operation}: ${errorMsg}`);

    if (this.verbose && error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  }

  // Report seed execution results
  reportSeedResults(results: SeedExecutionResult[]): void {
    console.log('\n📊 Seed Execution Summary:');
    console.log('='.repeat(50));

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    successful.forEach((result) => {
      const duration = this.formatDuration(result.duration);
      console.log(`✅ ${result.seedName} (${duration}, ${result.artifactsCreated} artifacts)`);

      if (result.message) {
        console.log(`   ${result.message}`);
      }
    });

    failed.forEach((result) => {
      console.error(`❌ ${result.seedName}: ${result.error?.message || 'Unknown error'}`);
    });

    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const totalArtifacts = successful.reduce((sum, r) => sum + r.artifactsCreated, 0);

    console.log('\n📈 Summary:');
    console.log(`   Successful: ${successful.length}/${results.length}`);
    console.log(`   Total artifacts created: ${totalArtifacts}`);
    console.log(`   Total time: ${this.formatDuration(totalDuration)}`);

    if (failed.length > 0) {
      console.error(`   Failed seeds: ${failed.length}`);
      console.error('   Check logs above for error details');
    }
  }

  // Show current status of all operations
  showStatus(): void {
    if (this.operations.size === 0) {
      console.log('✅ No active operations');
      return;
    }

    console.log('\n🔄 Active Operations:');
    this.operations.forEach((op, name) => {
      const percentage = Math.round((op.current / op.total) * 100);
      const progressBar = this.createProgressBar(op.current, op.total);
      const elapsed = Date.now() - op.startTime.getTime();
      const elapsedStr = this.formatDuration(elapsed);

      console.log(`   ${name}: ${progressBar} ${percentage}% (${elapsedStr})`);
    });
  }

  // Create a visual progress bar
  private createProgressBar(current: number, total: number, width: number = 20): string {
    const percentage = current / total;
    const filled = Math.round(percentage * width);
    const empty = width - filled;

    return `[${'█'.repeat(filled)}${' '.repeat(empty)}]`;
  }

  // Format duration in human-readable format
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else if (seconds > 0) {
      return `${seconds}s`;
    } else {
      return `${ms}ms`;
    }
  }

  // Get total elapsed time since reporter creation
  getTotalElapsed(): string {
    return this.formatDuration(Date.now() - this.startTime.getTime());
  }
}

// Simple progress callback implementation
export function createProgressCallback(reporter: ProgressReporter): ProgressCallback {
  return (update: ProgressUpdate) => {
    if (update.error) {
      reporter.reportError(update.operation, update.error);
    } else {
      reporter.updateProgress(update.operation, update.current, update.message);
    }
  };
}

// Utility for measuring operation time
export async function measureTime<T>(
  operation: string,
  fn: () => Promise<T>,
  reporter?: ProgressReporter,
): Promise<{ result: T; duration: number }> {
  const startTime = Date.now();

  try {
    const result = await fn();
    const duration = Date.now() - startTime;

    if (reporter && reporter instanceof ProgressReporter) {
      reporter.completeOperation(operation, `Completed in ${reporter['formatDuration'](duration)}`);
    }

    return { result, duration };
  } catch (error) {
    const duration = Date.now() - startTime;

    if (reporter) {
      reporter.reportError(operation, error as Error);
    }

    throw error;
  }
}
