import type { AiCapabilityId } from '@accountable-books/contracts/schema';

import type { RunnerName } from './types.js';

export type AiCapabilityPolicy = {
  maxSteps: number;
  maxToolCalls: number;
  maxRepeatToolCalls: number;
  timeoutMs: number;
};

export type ResolvedCapability = {
  capabilityId: AiCapabilityId;
  domain?: string;
  model: string;
  systemPrompt: string;
  policy: AiCapabilityPolicy;
  runner: RunnerName;
};

const DEFAULT_POLICY: AiCapabilityPolicy = {
  maxSteps: 5,
  maxToolCalls: 12,
  maxRepeatToolCalls: 3,
  timeoutMs: 30_000,
};

function domainFromCapabilityId(capabilityId: string) {
  // Expected: "<domain>.<name>.v<version>"
  const [domain] = capabilityId.split('.');
  return domain?.trim() || undefined;
}

type CapabilityEntry = {
  domain?: string;
  model?: string; // 'default' to use env default
  systemPrompt: string;
  policy?: Partial<AiCapabilityPolicy>;
  runner?: RunnerName;
};

const SCOPE_GUARDRAIL_PROMPT =
  'Stay strictly within accounting and this app workflows. ' +
  'If a request is unrelated, decline briefly and ask for accounting/app context. ' +
  'Never claim access to private endpoints, databases, source code, or the full app unless that data is explicitly provided in the request.';

function withScopeGuardrails(prompt: string): string {
  return `${prompt} ${SCOPE_GUARDRAIL_PROMPT}`;
}

const CAPABILITIES: Record<AiCapabilityId, CapabilityEntry> = {
  // Journals
  'journals.from_text.v1': {
    domain: 'journals',
    model: 'default',
    systemPrompt: withScopeGuardrails(
      'You are an accounting assistant focused on drafting journal entries. ' +
        'Ask clarifying questions when key fields are missing. Never post automatically.',
    ),
  },
  'journals.generate_memo.v1': {
    domain: 'journals',
    model: 'default',
    systemPrompt: withScopeGuardrails(
      'You are an accounting assistant that writes concise, professional journal memos. ' +
        'Keep it short, factual, and audit-friendly.',
    ),
    policy: { maxSteps: 2 },
  },
  'journals.dev_sample.v1': {
    domain: 'journals',
    model: 'default',
    systemPrompt: withScopeGuardrails(
      'You are a development test capability. Help validate UI, streaming, and gating. ' +
        'Be brief and deterministic.',
    ),
    policy: { maxSteps: 1 },
  },

  // Categorization
  'categorization.interpret_command.v1': {
    domain: 'categorization',
    model: 'default',
    systemPrompt: withScopeGuardrails(
      'You are an accounting assistant focused on safe transaction edits. ' +
        'Only propose changes; never apply changes without explicit approval.',
    ),
  },
  'categorization.clean_description.v1': {
    domain: 'categorization',
    model: 'default',
    systemPrompt: withScopeGuardrails(
      'Rewrite bank narratives into accountant-friendly descriptions. ' +
        'Preserve meaning and key identifiers.',
    ),
    policy: { maxSteps: 1 },
  },
  'categorization.explain.v1': {
    domain: 'categorization',
    model: 'default',
    systemPrompt: withScopeGuardrails(
      'Explain categorization decisions clearly and briefly. ' +
        'Reference the evidence provided in the prompt/context.',
    ),
    policy: { maxSteps: 2 },
  },
  'categorization.dev_sample.v1': {
    domain: 'categorization',
    model: 'default',
    systemPrompt: withScopeGuardrails(
      'You are a development test capability. Help validate UI, streaming, and gating. ' +
        'Be brief and deterministic.',
    ),
    policy: { maxSteps: 1 },
  },

  // Reporting (Financial statements)
  'reporting.explain.v1': {
    domain: 'reporting',
    model: 'default',
    systemPrompt: withScopeGuardrails(
      'You are an accounting assistant focused on explaining financial statements and drilldown context. ' +
        'Be concise, audit-friendly, and ask clarifying questions when period/basis/entity context is missing. ' +
        'Never post or mutate accounting data automatically; only explain and propose safe next steps.',
    ),
    policy: { maxSteps: 3 },
  },
  'reporting.dev_sample.v1': {
    domain: 'reporting',
    model: 'default',
    systemPrompt: withScopeGuardrails(
      'You are a development test capability for reporting. Help validate UI, streaming, and gating. ' +
        'Be brief and deterministic.',
    ),
    policy: { maxSteps: 1 },
  },
};

export function resolveCapability(params: {
  capabilityId: AiCapabilityId;
  domainHint?: string;
  defaultModel: string;
}): ResolvedCapability {
  const { capabilityId, domainHint, defaultModel } = params;
  const entry = CAPABILITIES[capabilityId];
  if (!entry) {
    throw new Error(`Capability not allowed: ${capabilityId}`);
  }

  const domain =
    entry.domain ?? domainHint ?? domainFromCapabilityId(capabilityId);
  const model =
    !entry.model || entry.model === 'default' ? defaultModel : entry.model;

  return {
    capabilityId,
    domain,
    model,
    systemPrompt: entry.systemPrompt,
    policy: {
      ...DEFAULT_POLICY,
      ...(entry.policy ?? {}),
    },
    runner: entry.runner ?? 'chat',
  };
}
