import type { DomainAIRegistration } from '@/modules/ai';
import { AI_DOMAINS, makeCapabilityId } from '@/modules/ai';

function containsAny(text: string, tokens: string[]) {
  const lower = text.toLowerCase();
  return tokens.some((t) => lower.includes(t));
}

export function dashboardReportingAiRegistration(): DomainAIRegistration {
  const devOnlyCapabilities = (import.meta as any).env?.DEV
    ? [
        {
          capabilityId: makeCapabilityId({
            domain: AI_DOMAINS.reporting,
            name: 'dev_sample',
            version: 1,
          }),
          domain: AI_DOMAINS.reporting,
          label: 'Dev: Reporting sample',
          description:
            'Development-only capability used to validate AI gating and UI flows on reporting pages.',
          match: (input: string) =>
            containsAny(input, ['dev', 'sample', 'test', 'ui']) ? 0.6 : 0,
        },
      ]
    : [];

  return {
    domain: AI_DOMAINS.reporting,
    domainLabel: 'Reporting',
    capabilities: [
      {
        capabilityId: makeCapabilityId({
          domain: AI_DOMAINS.reporting,
          name: 'explain',
          version: 1,
        }),
        domain: AI_DOMAINS.reporting,
        label: 'Explain this report',
        description:
          'Explain a statement line, variance, or period selection in an audit-friendly way.',
        shortcutHint: 'R',
        match: (input) =>
          containsAny(input, [
            'income statement',
            'profit',
            'loss',
            'p&l',
            'balance sheet',
            'cash flow',
            'trial balance',
            'variance',
            'compare',
            'prior year',
            'prior period',
            'why',
            'explain',
            'what changed',
          ])
            ? 1
            : 0,
      },
      ...devOnlyCapabilities,
    ],
  };
}
