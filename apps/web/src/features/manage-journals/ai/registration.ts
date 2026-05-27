import type { DomainAIRegistration } from '@/modules/ai';
import { AI_DOMAINS, makeCapabilityId } from '@/modules/ai';

function containsAny(text: string, tokens: string[]) {
  const lower = text.toLowerCase();
  return tokens.some((t) => lower.includes(t));
}

export function journalsAiRegistration(): DomainAIRegistration {
  const devOnlyCapabilities = (import.meta as any).env?.DEV
    ? [
        {
          capabilityId: makeCapabilityId({
            domain: AI_DOMAINS.journals,
            name: 'dev_sample',
            version: 1,
          }),
          domain: AI_DOMAINS.journals,
          label: 'Dev: Sample capability',
          description:
            'Development-only capability used to validate AI gating, UI flows, and capability selection.',
          match: (input: string) =>
            containsAny(input, ['dev', 'sample', 'test', 'ui']) ? 0.6 : 0,
        },
      ]
    : [];

  return {
    domain: AI_DOMAINS.journals,
    domainLabel: 'Journals',
    capabilities: [
      {
        capabilityId: makeCapabilityId({
          domain: AI_DOMAINS.journals,
          name: 'from_text',
          version: 1,
        }),
        domain: AI_DOMAINS.journals,
        label: 'Draft from text',
        description: 'Turn a description into a draft journal proposal',
        shortcutHint: 'J',
        match: (input) =>
          containsAny(input, [
            'journal',
            'entry',
            'record',
            'post',
            'draft',
            'rent',
            'invoice',
            'paid',
            'received',
            'debit',
            'credit',
          ])
            ? 1
            : 0,
      },
      {
        capabilityId: makeCapabilityId({
          domain: AI_DOMAINS.journals,
          name: 'generate_memo',
          version: 1,
        }),
        domain: AI_DOMAINS.journals,
        label: 'Generate memo',
        description: 'Suggest a professional memo for a journal entry',
        shortcutHint: 'M',
        match: (input) =>
          containsAny(input, ['memo', 'note', 'wording']) ? 0.8 : 0,
      },
      ...devOnlyCapabilities,
    ],
  };
}
