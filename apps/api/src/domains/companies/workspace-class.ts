import type { WorkspaceClass } from './companies.types.js';

export function isDemoWorkspace(
  workspaceClass: WorkspaceClass | string | null | undefined,
): boolean {
  return workspaceClass === 'demo';
}

export function isPlatformWorkspace(
  workspaceClass: WorkspaceClass | string | null | undefined,
): boolean {
  return workspaceClass === 'platform';
}

export function isPartnerWorkspace(
  workspaceClass: WorkspaceClass | string | null | undefined,
): boolean {
  return workspaceClass === 'partner';
}
