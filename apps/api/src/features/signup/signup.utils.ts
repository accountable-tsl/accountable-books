export function determineFirmCompanyDisplayName(legalName: string, displayName?: string) {
  if (!displayName || legalName === displayName) {
    return `${displayName || legalName} HQ`;
  }
  return displayName || legalName;
}
