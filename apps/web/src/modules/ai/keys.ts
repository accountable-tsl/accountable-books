export const AI_DOMAINS = {
  journals: 'journals',
  categorization: 'categorization',
  reporting: 'reporting',
  banking: 'banking',
} as const;

export type AiDomainKey = (typeof AI_DOMAINS)[keyof typeof AI_DOMAINS];

export function makeCapabilityId(params: {
  domain: AiDomainKey;
  name: string;
  version: number;
}) {
  const safeName = params.name.trim().toLowerCase().replace(/\s+/g, '_');
  return `${params.domain}.${safeName}.v${params.version}` as const;
}
