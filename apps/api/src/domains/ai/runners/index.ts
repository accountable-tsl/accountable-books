import { runChatRunner } from './chat.runner.js';

import type { ChatRunner, RunnerName, RunParams } from './types.js';

const RUNNERS: Record<RunnerName, ChatRunner> = {
  chat: {
    run: (params: RunParams) => runChatRunner(params),
  },
};

/**
 * Returns the runner for the given name. Use cap.runner when the registry
 * exposes it (e.g. for future 'agent' runner).
 */
export function getRunner(name: RunnerName = 'chat'): ChatRunner {
  const runner = RUNNERS[name];
  if (!runner) {
    throw new Error(`Unknown runner: ${name}`);
  }
  return runner;
}

export { runChatRunner } from './chat.runner.js';
export type { RunParams, RunnerName } from './types.js';
