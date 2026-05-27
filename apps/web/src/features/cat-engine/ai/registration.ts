import type { DomainAIRegistration } from '@/modules/ai';
import { AI_DOMAINS, makeCapabilityId } from '@/modules/ai';

function containsAny(text: string, tokens: string[]) {
  const lower = text.toLowerCase();
  return tokens.some((t) => lower.includes(t));
}

export function catEngineAiRegistration(): DomainAIRegistration {
  const devOnlyCapabilities = (import.meta as any).env?.DEV
    ? [
        {
          capabilityId: makeCapabilityId({
            domain: AI_DOMAINS.categorization,
            name: 'dev_sample',
            version: 1,
          }),
          domain: AI_DOMAINS.categorization,
          label: 'Dev: Sample capability',
          description:
            'Development-only capability used to validate AI gating, UI flows, and capability selection.',
          match: (input: string) =>
            containsAny(input, ['dev', 'sample', 'test', 'ui']) ? 0.6 : 0,
        },
      ]
    : [];

  return {
    domain: AI_DOMAINS.categorization,
    domainLabel: 'Transactions',
    capabilities: [
      {
        capabilityId: makeCapabilityId({
          domain: AI_DOMAINS.categorization,
          name: 'interpret_command',
          version: 1,
        }),
        domain: AI_DOMAINS.categorization,
        label: 'Edit transactions',
        description:
          'Turn natural language into safe proposed edits (split, set vendor, assign account)',
        shortcutHint: 'T',
        match: (input) =>
          containsAny(input, [
            'split',
            'vendor',
            'contact',
            'assign',
            'account',
            'category',
            'memo',
            'reference',
            'project',
            'fx',
            'exchange rate',
          ])
            ? 1
            : 0,
      },
      {
        capabilityId: makeCapabilityId({
          domain: AI_DOMAINS.categorization,
          name: 'clean_description',
          version: 1,
        }),
        domain: AI_DOMAINS.categorization,
        label: 'Clean description',
        description:
          'Rewrite bank narrative into an accountant-friendly description',
        shortcutHint: 'D',
        match: (input) =>
          containsAny(input, ['clean', 'rewrite', 'shorten']) ? 0.8 : 0,
      },
      {
        capabilityId: makeCapabilityId({
          domain: AI_DOMAINS.categorization,
          name: 'explain',
          version: 1,
        }),
        domain: AI_DOMAINS.categorization,
        label: 'Explain categorization',
        description:
          'Explain why a transaction belongs to a category and what evidence was used',
        shortcutHint: 'E',
        match: (input) =>
          containsAny(input, ['why', 'explain', 'reason']) ? 0.7 : 0,
      },
      ...devOnlyCapabilities,
    ],
  };
}
