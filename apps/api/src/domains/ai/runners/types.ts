import type { LanguageModelUsage, UIMessage } from 'ai';
import type { Request, Response } from 'express';

import type { ResolvedCapability } from '../capabilities/registry.js';
import type { RunnerName } from '../capabilities/types.js';

export type { RunnerName } from '../capabilities/types.js';

export type RunParams = {
  cap: ResolvedCapability;
  messages: UIMessage[];
  apiKey: string;
  abortSignal: AbortSignal;
  res: Response;
  req: Request;
};

export type RunnerResult = {
  finishReason?: string;
  rawFinishReason?: string;
  usage?: LanguageModelUsage;
  totalUsage?: LanguageModelUsage;
};

export type ChatRunner = {
  run(params: RunParams): Promise<RunnerResult>;
};
