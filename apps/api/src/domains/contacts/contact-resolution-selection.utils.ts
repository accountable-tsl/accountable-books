export type ContactEvidenceSelection = {
  contactId: string | null;
  aliasId: string | null;
  source: 'alias' | 'heuristic';
  confidence: number | null;
  reason: string;
  status?: 'ambiguous';
};

export function chooseContactMatch({
  aliases,
  contacts,
}: {
  aliases: { id: string; contact_id: string }[];
  contacts: { id: string }[];
}): ContactEvidenceSelection | null {
  const candidateIds = new Set([
    ...aliases.map((alias) => alias.contact_id),
    ...contacts.map((contact) => contact.id),
  ]);

  if (candidateIds.size === 0) return null;

  if (candidateIds.size > 1) {
    return {
      contactId: null,
      aliasId: null,
      source: 'heuristic',
      confidence: null,
      status: 'ambiguous',
      reason: 'Canonical-name and alias evidence identify multiple contacts',
    };
  }

  const [contactId] = candidateIds;
  const matchingAlias = aliases.find((alias) => alias.contact_id === contactId);

  return {
    contactId,
    aliasId: matchingAlias?.id ?? null,
    source: matchingAlias ? 'alias' : 'heuristic',
    confidence: matchingAlias ? 1 : 0.95,
    reason: matchingAlias
      ? 'Exact active alias and canonical-name evidence identify one contact'
      : 'Exact normalized-name match to one active contact',
  };
}
